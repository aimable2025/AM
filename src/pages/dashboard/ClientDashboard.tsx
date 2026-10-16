import {
  Coins,
  CreditCard,
  LogOut,
  Receipt,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import BilletageModule from './components/BilletageModule';
import { db } from '../../lib/db';
import type { Operation } from '../../types/operation';

export default function ClientDashboard() {
  const { user, signOut } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    if (!user) return;
    db.operations
      .toArray()
      .then((all) => {
        const mine = all.filter(
          (op) =>
            op.createdBy === user.uid ||
            (user.phone && op.accountNumber === user.phone) ||
            (user.phoneNumber && op.accountNumber === user.phoneNumber)
        );
        mine.sort((a, b) => b.createdAt - a.createdAt);
        setOperations(mine);
      })
      .catch(() => {});
  }, [user]);

  const handleSidebarNavigate = (item: string) => {
    if (item === 'billetage') {
      setShowBilletage(true);
    } else if (item === 'dashboard' || item === 'transactions') {
      setShowBilletage(false);
    }
  };

  return (
    <AppLayout
      title="Espace Client — Ets AMANI"
      subtitle="Consultation de vos transactions, transferts et paiements"
      activeItem={showBilletage ? 'billetage' : 'dashboard'}
      onNavigate={handleSidebarNavigate}
    >
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-white/30 shadow-lg"
              />
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-3xl">
                  Bienvenue, {user?.displayName}
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  Compte Client certifié Ets AMANI • Accès guichet & services de change
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              <button
                type="button"
                onClick={() => setShowBilletage((v) => !v)}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300"
              >
                <Coins className="h-4 w-4" />
                {showBilletage ? 'Masquer Billetage' : 'Calculateur Billetage'}
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {showBilletage && (
          <BilletageModule onClose={() => setShowBilletage(false)} />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Dernières Opérations</h2>
                <p className="text-xs text-slate-500">Historique de vos opérations au guichet</p>
              </div>
            </div>
            {operations.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                Aucune opération récente enregistrée.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {operations.map((op) => (
                  <div key={op.id} className="py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{op.title}</p>
                      <p className="text-slate-500">{op.operationNumber} • {op.agencyName}</p>
                    </div>
                    <div className="text-right">
                      {op.amount !== undefined && (
                        <p className="font-bold text-emerald-700">
                          {op.amount.toLocaleString('fr-FR')} {op.currency}
                        </p>
                      )}
                      <p className="text-slate-400">
                        {new Date(op.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Services Disponibles</h2>
                <p className="text-xs text-slate-500">Présentez-vous en agence pour vos transactions</p>
              </div>
            </div>
            <ul className="text-xs space-y-2 text-slate-600">
              <li className="p-3 bg-slate-50 rounded-xl">✓ Change manuel devises USD / CDF</li>
              <li className="p-3 bg-slate-50 rounded-xl">✓ Dépôts et retraits Mobile Money</li>
              <li className="p-3 bg-slate-50 rounded-xl">✓ Transferts inter-agences sécurisés</li>
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
