import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    db,
    type Branch,
    type Company,
    type User,
    createRecordMetadata,
    DEFAULT_BRANCH_ID,
    DEFAULT_COMPANY_ID,
} from '../services/db';
import LoadingScreen from '../components/UI/LoadingScreen';
import * as forge from 'node-forge';
import { PERMISSIONS, userHasPermission, permissionIdFor, type PermissionSection } from '../auth/permissions';

interface AuthContextType {
    user: User | null;
    token: string | null;
    activeCompanyId: string;
    activeCompany: Company | null;
    availableCompanies: Company[];
    activeBranchId: string;
    activeBranch: Branch | null;
    availableBranches: Branch[];
    login: (username: string, password: string) => Promise<boolean>;
    resetAdminPassword: (newPassword: string) => Promise<string>;
    logout: () => void;
    switchCompany: (companyId: string) => Promise<void>;
    switchBranch: (branchId: string) => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
    hasPermission: (permission: string) => boolean;
    can: (permission: string) => boolean;
    canView: (section: PermissionSection) => boolean;
    canCreate: (section: PermissionSection) => boolean;
    canUpdate: (section: PermissionSection) => boolean;
    canDelete: (section: PermissionSection) => boolean;
    logActivity: (action: string, details?: string) => Promise<void>;
}

export { PERMISSIONS };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SECURE_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 5000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const [activeCompanyId, setActiveCompanyId] = useState<string>(localStorage.getItem('currentCompanyId') || DEFAULT_COMPANY_ID);
    const [activeCompany, setActiveCompany] = useState<Company | null>(null);
    const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
    const [activeBranchId, setActiveBranchId] = useState<string>(localStorage.getItem('currentBranchId') || DEFAULT_BRANCH_ID);
    const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
    const [activeBranch, setActiveBranch] = useState<Branch | null>({
        id: DEFAULT_BRANCH_ID,
        companyId: DEFAULT_COMPANY_ID,
        name: 'Default Store',
        location: '',
        phone: '',
        isMaster: true,
        status: 'active',
        updatedAt: new Date(),
        branchId: DEFAULT_BRANCH_ID
    });

    useEffect(() => {
        const ensureDefaultOrganization = async () => {
            const now = new Date();
            const defaultCompany = await db.companies.get(DEFAULT_COMPANY_ID);
            if (!defaultCompany) {
                await db.companies.add({
                    id: DEFAULT_COMPANY_ID,
                    name: 'Default Company',
                    legalName: 'Default Company',
                    country: 'Saudi Arabia',
                    status: 'active',
                    createdAt: now,
                    updatedAt: now,
                });
            }

            const masterBranch = await db.branches.get(DEFAULT_BRANCH_ID);
            if (!masterBranch) {
                await db.branches.add({
                    id: DEFAULT_BRANCH_ID,
                    companyId: DEFAULT_COMPANY_ID,
                    name: 'Default Store',
                    location: '',
                    phone: '',
                    isMaster: true,
                    status: 'active',
                    country: 'Saudi Arabia',
                    taxName: 'VAT',
                    taxRate: 15,
                    updatedAt: now,
                    branchId: DEFAULT_BRANCH_ID
                });
            } else if (!masterBranch.companyId) {
                await db.branches.update(masterBranch.id, { companyId: DEFAULT_COMPANY_ID });
            }
        };

        const loadOrganizationScope = async () => {
            await ensureDefaultOrganization();

            const allCompanies = await db.companies
                .filter(company => company.status === 'active' && !company.deletedAt)
                .toArray();

            const allowedCompanyIds = user?.role === 'admin'
                ? allCompanies.map(company => company.id)
                : (user?.companyIds?.length ? user.companyIds : [user?.defaultCompanyId || DEFAULT_COMPANY_ID]);

            const scopedCompanies = allCompanies.filter(company => allowedCompanyIds.includes(company.id));
            const preferredCompanyId = scopedCompanies.some(company => company.id === activeCompanyId)
                ? activeCompanyId
                : scopedCompanies[0]?.id || DEFAULT_COMPANY_ID;

            const company = scopedCompanies.find(item => item.id === preferredCompanyId)
                || await db.companies.get(preferredCompanyId)
                || null;

            setAvailableCompanies(scopedCompanies);
            setActiveCompany(company);
            setActiveCompanyId(preferredCompanyId);
            localStorage.setItem('currentCompanyId', preferredCompanyId);

            const allBranches = await db.branches
                .where('companyId')
                .equals(preferredCompanyId)
                .filter(branch => branch.status === 'active' && !branch.deletedAt)
                .toArray();

            const allowedBranchIds = user?.role === 'admin'
                ? allBranches.map(branch => branch.id)
                : (user?.branchIds?.length ? user.branchIds : [user?.defaultBranchId || DEFAULT_BRANCH_ID]);

            const scopedBranches = allBranches.filter(branch => allowedBranchIds.includes(branch.id));
            setAvailableBranches(scopedBranches);

            const preferredBranchId = scopedBranches.some(branch => branch.id === activeBranchId)
                ? activeBranchId
                : scopedBranches[0]?.id || DEFAULT_BRANCH_ID;

            const branch = scopedBranches.find(item => item.id === preferredBranchId)
                || await db.branches.get(preferredBranchId)
                || null;

            if (branch) {
                setActiveBranch(branch);
                setActiveBranchId(branch.id);
                localStorage.setItem('currentBranchId', branch.id);
            }
        };

        if (!loading) loadOrganizationScope();
    }, [loading, user, activeCompanyId, activeBranchId]);

    useEffect(() => {
        const initAuth = async () => {
            try {
                // Ensure default admin exists
                const adminCount = await db.users.where('role').equals('admin').count();

                if (adminCount === 0) {
                    const salt = forge.util.encode64(forge.random.getBytesSync(16));
                    const derivedKey = forge.pkcs5.pbkdf2('admin123', salt, SECURE_ITERATIONS, 32, forge.md.sha256.create());
                    const hashedPassword = forge.util.encode64(derivedKey);

                    await db.users.add({
                        ...createRecordMetadata(),
                        username: 'admin',
                        password: hashedPassword,
                        salt: salt,
                        isHashed: true,
                        iterations: SECURE_ITERATIONS,
                        forcePasswordChange: true,
                        role: 'admin',
                        name: 'System Admin',
                        permissions: [],
                        companyIds: [DEFAULT_COMPANY_ID],
                        branchIds: [DEFAULT_BRANCH_ID],
                        defaultCompanyId: DEFAULT_COMPANY_ID,
                        defaultBranchId: DEFAULT_BRANCH_ID
                    });
                    console.log("Seeded default admin user with hardened security");
                }

                // Validate existing token (Now using HMAC Signature)
                if (token && window.electron) {
                    try {
                        const payload = await window.electron.verifyToken(token);
                        if (payload) {
                            const [idStr] = payload.split(':');
                            const foundUser = await db.users.get(idStr);
                            if (foundUser) {
                                setUser(foundUser);
                            } else {
                                logout();
                            }
                        } else {
                            console.warn("Insecure or tampered token detected. Logging out.");
                            logout();
                        }
                    } catch (e) {
                        console.error("Token validation failed:", e);
                        logout();
                    }
                } else if (token) {
                    // In browser mode without electron, just decode (Dev fallback)
                    try {
                        const decoded = atob(token.split('.')[0]); // Take payload part
                        const [idStr] = decoded.split(':');
                        const foundUser = await db.users.get(idStr);
                        if (foundUser) setUser(foundUser);
                        else logout();
                    } catch { logout(); }
                }
            } catch (error) {
                console.error("Auth initialization failed:", error);
            } finally {
                setLoading(false);
            }
        };

        initAuth();
        return () => { };
    }, []);

    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            const foundUser = await db.users.where('username').equalsIgnoreCase(username).first();
            if (!foundUser) return false;

            let isValid = false;
            const currentIterations = foundUser.iterations || (foundUser.isHashed ? LEGACY_ITERATIONS : 0);

            if (foundUser.isHashed && foundUser.salt) {
                const derivedKey = forge.pkcs5.pbkdf2(password, foundUser.salt, currentIterations, 32, forge.md.sha256.create());
                const hashAttempt = forge.util.encode64(derivedKey);
                isValid = (foundUser.password === hashAttempt);
            } else if (foundUser.password === password) {
                // Raw password (unlikely but handled)
                isValid = true;
            }

            if (isValid) {
                // Check if we need to upgrade hashing iterations
                if (currentIterations < SECURE_ITERATIONS) {
                    const newSalt = forge.util.encode64(forge.random.getBytesSync(16));
                    const newDerivedKey = forge.pkcs5.pbkdf2(password, newSalt, SECURE_ITERATIONS, 32, forge.md.sha256.create());
                    const newHashedPassword = forge.util.encode64(newDerivedKey);
                    
                    await db.users.update(foundUser.id!, {
                        password: newHashedPassword,
                        salt: newSalt,
                        isHashed: true,
                        iterations: SECURE_ITERATIONS
                    });
                    console.log(`User ${username} migrated to ${SECURE_ITERATIONS} iterations`);
                }

                const scopedUser = {
                    ...foundUser,
                    companyIds: foundUser.companyIds?.length ? foundUser.companyIds : [foundUser.defaultCompanyId || DEFAULT_COMPANY_ID],
                    branchIds: foundUser.branchIds?.length ? foundUser.branchIds : [foundUser.defaultBranchId || DEFAULT_BRANCH_ID],
                    defaultCompanyId: foundUser.defaultCompanyId || DEFAULT_COMPANY_ID,
                    defaultBranchId: foundUser.defaultBranchId || DEFAULT_BRANCH_ID,
                };

                setUser(scopedUser);
                localStorage.setItem('currentCompanyId', scopedUser.defaultCompanyId);
                localStorage.setItem('currentBranchId', scopedUser.defaultBranchId);
                setActiveCompanyId(scopedUser.defaultCompanyId);
                setActiveBranchId(scopedUser.defaultBranchId);
                
                // Create Signed Session Token: [UserID]:[Role]:[Timestamp]:[Entropy]
                const payload = `${foundUser.id}:${foundUser.role}:${Date.now()}:${crypto.randomUUID()}`;
                let newToken = '';
                if (window.electron) {
                    newToken = await window.electron.signToken(payload);
                } else {
                    newToken = btoa(payload) + '.dev-unsigned-token';
                }
                
                setToken(newToken);
                localStorage.setItem('token', newToken);

                await db.activityLogs.add({
                    ...createRecordMetadata(),
                    userId: foundUser.id!,
                    username: foundUser.username,
                    action: 'LOGIN',
                    timestamp: new Date()
                });

                return true;
            }
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
        return false;
    };

    const resetAdminPassword = async (newPassword: string): Promise<string> => {
        const trimmedPassword = newPassword.trim();
        if (trimmedPassword.length < 6) {
            throw new Error('The new password must contain at least 6 characters.');
        }

        const adminUser = await db.users.where('role').equals('admin').first();
        const salt = forge.util.encode64(forge.random.getBytesSync(16));
        const derivedKey = forge.pkcs5.pbkdf2(trimmedPassword, salt, SECURE_ITERATIONS, 32, forge.md.sha256.create());
        const passwordHash = forge.util.encode64(derivedKey);

        if (adminUser?.id !== undefined) {
            await db.users.update(adminUser.id, {
                password: passwordHash,
                salt,
                isHashed: true,
                iterations: SECURE_ITERATIONS,
                forcePasswordChange: false,
            });
            return adminUser.username;
        }

        const username = 'admin';
        await db.users.add({
            ...createRecordMetadata(),
            username,
            password: passwordHash,
            salt,
            isHashed: true,
            iterations: SECURE_ITERATIONS,
            forcePasswordChange: false,
            role: 'admin',
            name: 'System Admin',
            permissions: [],
            companyIds: [DEFAULT_COMPANY_ID],
            branchIds: [DEFAULT_BRANCH_ID],
            defaultCompanyId: DEFAULT_COMPANY_ID,
            defaultBranchId: DEFAULT_BRANCH_ID,
        });
        return username;
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        window.location.reload();
    };

    const switchCompany = async (companyId: string) => {
        const company = availableCompanies.find(item => item.id === companyId) || await db.companies.get(companyId);
        if (!company) return;

        const branches = await db.branches
            .where('companyId')
            .equals(company.id)
            .filter(branch => branch.status === 'active' && !branch.deletedAt)
            .toArray();

        const scopedBranches = user?.role === 'admin'
            ? branches
            : branches.filter(branch => (user?.branchIds || [DEFAULT_BRANCH_ID]).includes(branch.id));

        const nextBranch = scopedBranches[0];
        setActiveCompany(company);
        setActiveCompanyId(company.id);
        setAvailableBranches(scopedBranches);
        localStorage.setItem('currentCompanyId', company.id);

        if (nextBranch) {
            setActiveBranch(nextBranch);
            setActiveBranchId(nextBranch.id);
            localStorage.setItem('currentBranchId', nextBranch.id);
        }
    };

    const switchBranch = async (branchId: string) => {
        const branch = availableBranches.find(item => item.id === branchId) || await db.branches.get(branchId);
        if (!branch) return;
        setActiveBranch(branch);
        setActiveBranchId(branch.id);
        localStorage.setItem('currentBranchId', branch.id);
        if (branch.companyId && branch.companyId !== activeCompanyId) {
            setActiveCompanyId(branch.companyId);
            localStorage.setItem('currentCompanyId', branch.companyId);
        }
    };

    const hasPermission = (permission: string): boolean => {
        if (!user) return false;
        if (user.role === 'admin') return true; // Admin has all permissions
        return userHasPermission(user.permissions, permission);
    };

    const can = hasPermission;
    const canView = (section: PermissionSection) => hasPermission(permissionIdFor(section, 'view'));
    const canCreate = (section: PermissionSection) => hasPermission(permissionIdFor(section, 'create'));
    const canUpdate = (section: PermissionSection) => hasPermission(permissionIdFor(section, 'update'));
    const canDelete = (section: PermissionSection) => hasPermission(permissionIdFor(section, 'delete'));

    const logActivity = async (action: string, details?: string) => {
        if (!user) return;
        try {
            await db.activityLogs.add({
                ...createRecordMetadata(),
                userId: user.id!,
                username: user.username,
                action,
                details,
                timestamp: new Date()
            });
        } catch (e) {
            console.error("Failed to log activity", e);
        }
    };

    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <AuthContext.Provider value={{
            user,
            token,
            activeCompanyId,
            activeCompany,
            availableCompanies,
            activeBranchId,
            activeBranch,
            availableBranches,
            login,
            resetAdminPassword,
            logout,
            switchCompany,
            switchBranch,
            isAuthenticated: !!user,
            isAdmin: user?.role === 'admin',
            hasPermission,
            can,
            canView,
            canCreate,
            canUpdate,
            canDelete,
            logActivity
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
