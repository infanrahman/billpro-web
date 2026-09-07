import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, User, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Login: React.FC = () => {
    const { login, resetAdminPassword } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryPassword, setRecoveryPassword] = useState('');
    const [recoveryConfirmation, setRecoveryConfirmation] = useState('');
    const [recoveryError, setRecoveryError] = useState('');
    const [recoveryMessage, setRecoveryMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const success = await login(username, password);
            if (success) {
                navigate('/');
            } else {
                setError(t('login.invalid_credentials'));
            }
        } catch (err: any) {
            setError(t('login.error_login') + ": " + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setRecoveryError('');
        setRecoveryMessage('');

        if (recoveryConfirmation.trim().toUpperCase() !== 'RESET ADMIN') {
            setRecoveryError('Type RESET ADMIN to confirm the local password reset.');
            return;
        }

        try {
            const username = await resetAdminPassword(recoveryPassword);
            setRecoveryMessage(`Password updated for local admin account “${username}”. You can sign in now.`);
            setRecoveryPassword('');
            setRecoveryConfirmation('');
        } catch (err: any) {
            setRecoveryError(err.message || 'Unable to reset the local admin password.');
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Dynamic Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-20%] right-[-10%] w-[900px] h-[900px] bg-blue-600/30 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[700px] h-[700px] bg-cyan-500/20 rounded-full blur-3xl opacity-50" />
                <div className="absolute top-[30%] left-[20%] w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl opacity-50" />
            </div>

            <div className="glass premium-shadow rounded-3xl w-full max-w-4xl flex overflow-hidden relative z-10 border border-white/20 animate-fade-in-up">
                {/* Left Side - Hero / Brand */}
                <div className="hidden md:flex flex-col justify-center w-1/2 premium-gradient p-12 text-white relative">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('/pattern-bg.png')] opacity-5 mix-blend-overlay"></div>
                    <div className="relative z-10">
                        <div className="mb-8 w-20 h-20 rounded-2xl flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
                            <ShieldCheck size={48} className="text-white" />
                        </div>
                        <h1 className="text-5xl font-extrabold mb-6 font-sans tracking-tight leading-tight">
                            {t('login.brand_title')}
                        </h1>
                        <p className="text-blue-50 text-xl leading-relaxed opacity-90 font-medium">
                            {t('login.brand_subtitle')}
                        </p>

                        <div className="mt-16 flex items-center gap-4 text-sm font-semibold text-blue-100/80">
                            <div className="w-12 h-[2px] bg-blue-300/50"></div>
                            <span className="tracking-widest uppercase text-xs">{t('login.secure_reliable')}</span>
                        </div>
                    </div>
                </div>

                {/* Right Side - Login Form */}
                <div className="w-full md:w-1/2 p-8 md:p-14 bg-white/80 backdrop-blur-xl flex flex-col justify-center">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('login.welcome_back')}</h2>
                        <p className="text-slate-500 text-sm">{t('login.signin_text')}</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-3 text-sm border border-red-100 animate-fadeIn">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 ml-1">{t('users.username')}</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium text-slate-700 placeholder-slate-400"
                                    placeholder={t('login.enter_username')}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 ml-1">{t('users.password')}</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium text-slate-700 placeholder-slate-400"
                                    placeholder={t('login.password_placeholder')}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-4 mt-4 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30
                                ${loading
                                    ? 'bg-blue-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 hover:shadow-blue-500/40 active:scale-[0.98]'
                                }
                            `}
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {t('login.sign_in_btn')} <ArrowRight size={20} />
                                </>
                            )}
                        </button>
                    </form>

                    <button
                        type="button"
                        onClick={() => {
                            setShowRecovery((value) => !value);
                            setRecoveryError('');
                            setRecoveryMessage('');
                        }}
                        className="mt-5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                        {showRecovery ? 'Cancel password recovery' : 'Forgot the local admin password?'}
                    </button>

                    {showRecovery && (
                        <form onSubmit={handleRecovery} className="mt-4 space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <p className="text-xs leading-relaxed text-amber-800">
                                This resets only the local admin password. Your sales, inventory, customers, and settings will be preserved.
                            </p>
                            {recoveryError && <p className="text-xs font-semibold text-red-600">{recoveryError}</p>}
                            {recoveryMessage && <p className="text-xs font-semibold text-emerald-700">{recoveryMessage}</p>}
                            <input
                                type="password"
                                value={recoveryPassword}
                                onChange={(e) => setRecoveryPassword(e.target.value)}
                                placeholder="New password (6+ characters)"
                                minLength={6}
                                required
                                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500"
                            />
                            <input
                                type="text"
                                value={recoveryConfirmation}
                                onChange={(e) => setRecoveryConfirmation(e.target.value)}
                                placeholder="Type RESET ADMIN"
                                required
                                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-500"
                            />
                            <button type="submit" className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700">
                                Reset Local Admin Password
                            </button>
                        </form>
                    )}

                    <div className="mt-8 text-center">
                        <p className="text-xs text-slate-400">
                            {t('login.secure_msg')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
