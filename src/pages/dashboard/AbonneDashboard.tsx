import {
  Coins,
  LogOut,
  Receipt,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import BilletageModule from './components/BilletageModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import type { Operation } from '../../types/operation';

export default function AbonneDashboard() {
  const { user, signOut } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [agencyName, setAgencyName] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    if (user.agencyId) {
      getAgency(user.agencyId)
        .then((ag) => {
          if (ag?.name) setAgencyName(ag.name);
        })
        .catch(() => {});
    }
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
      title="Espace Abonné Privilégié — Ets AMANI"
      subtitle="Compte Partenaire & facilitation des transferts de fonds"
      activeItem={showBilletage ? 'billetage' : 'dashboard'}
      onNavigate={handleSidebarNavigate}
    >
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-purple-400/50 shadow-lg"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight sm:text-3xl">
                    Espace Abonné
                  </h1>
                  <span className="rounded-full bg-purple-400/20 px-2.5 py-0.5 text-xs font-bold text-purple-300">
                    Partenaire VIP
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  Titulaire : <strong>{user?.displayName}</strong> • Agence de rattachement :{' '}
                  <span className="font-semibold">{agencyName || user?.agencyId || 'Centrale'}</span>
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Avantages Abonné</h2>
                <p className="text-xs text-slate-500">Conditions préférentielles sur le réseau</p>
              </div>
            </div>
            <ul className="text-xs space-y-2 text-slate-600">
              <li className="p-3 bg-slate-50 rounded-xl">★ Taux de change préférentiels négociés</li>
              <li className="p-3 bg-slate-50 rounded-xl">★ Traitement prioritaire au guichet de votre agence</li>
              <li className="p-3 bg-slate-50 rounded-xl">★ Ligne directe avec le responsable d'agence</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Activité Récente</h2>
                <p className="text-xs text-slate-500">Mouvements de fonds enregistrés</p>
              </div>
            </div>
            {operations.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                Aucun mouvement récent enregistré sur votre compte abonné.
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
        </div>
      </div>
    </AppLayout>
  );
}
