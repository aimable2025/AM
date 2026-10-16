import {
  Activity,
  Building2,
  CheckCircle2,
  Hash,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import UserAvatar from '../../../components/common/UserAvatar';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import {
  getAgencies,
  type Agency,
} from '../../../services/AgencyService';
import {
  getAgencyUsersByRole,
  type AgencyUser,
} from '../../../services/AgencyUserService';
import {
  assignInternalNumber,
  createInternalNumber,
  deleteInternalNumber,
  getInternalNumbers,
  setMonitoringState,
  unassignInternalNumber,
  updateInternalNumberStatus,
} from '../../../services/InternalNumberService';
import { getRecentSmsOperations } from '../../../services/SmsOperationService';
import type {
  InternalNumber,
  InternalNumberStatus,
  MobileOperator,
} from '../../../types/internalNumber';
import type { SmsOperation } from '../../../types/smsOperation';

interface InternalNumbersModuleProps {
  onClose?: () => void;
}

const OPERATORS: {
  value: MobileOperator;
  label: string;
}[] = [
  { value: 'vodacom', label: 'Vodacom' },
  { value: 'airtel', label: 'Airtel' },
  { value: 'orange', label: 'Orange' },
  { value: 'africell', label: 'Africell' },
];

const STATUS_OPTIONS: {
  value: InternalNumberStatus;
  label: string;
}[] = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'archived', label: 'Archivé' },
];

function operatorLabel(operator: MobileOperator): string {
  return OPERATORS.find((item) => item.value === operator)?.label ?? operator;
}

function statusLabel(status: InternalNumberStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function statusClasses(status: InternalNumberStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700';
    case 'suspended':
      return 'bg-red-50 text-red-700';
    case 'archived':
      return 'bg-slate-100 text-slate-600';
    case 'inactive':
    default:
      return 'bg-amber-50 text-amber-700';
  }
}

interface CollaborationMessage {
  id: string;
  channelId: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  senderPhotoURL?: string | null;
  text: string;
  createdAt: number;
}

const COLLAB_CHANNELS = [
  { id: 'direction-generale', label: 'Direction & Supervision', roleBadge: 'DG' },
  { id: 'guichet-operations', label: 'Guichet & Opérations', roleBadge: 'AG' },
  { id: 'tresorerie-billetage', label: 'Trésorerie & Billetage', roleBadge: 'CA' },
];

const LOCAL_COLLAB_KEY = 'ets_amani_internal_collab_messages_v1';

function loadCollabMessages(): CollaborationMessage[] {
  try {
    const raw = localStorage.getItem(LOCAL_COLLAB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function InternalNumbersModule({
  onClose,
}: InternalNumbersModuleProps) {
  const { user } = useAuth();
  const [numbers, setNumbers] = useState<InternalNumber[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agents, setAgents] = useState<Record<string, AgencyUser[]>>({});
  const [teamMembers, setTeamMembers] = useState<ManagedUser[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('direction-generale');
  const [collabMessages, setCollabMessages] = useState<CollaborationMessage[]>(() =>
    loadCollabMessages()
  );
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [operator, setOperator] = useState<MobileOperator>('vodacom');
  const [agencyId, setAgencyId] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteNumber, setConfirmDeleteNumber] = useState<InternalNumber | null>(null);
  const [smsOperations, setSmsOperations] = useState<SmsOperation[]>([]);

  const handleSendCollabMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !user) return;
    const newMsg: CollaborationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      channelId: activeChannelId,
      senderUid: user.uid,
      senderName: user.displayName || 'Intervenant',
      senderRole: user.role,
      senderPhotoURL: user.photoURL || null,
      text: messageInput.trim(),
      createdAt: Date.now(),
    };
    const next = [...collabMessages, newMsg];
    setCollabMessages(next);
    try {
      localStorage.setItem(LOCAL_COLLAB_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      // ignore
    }
    setMessageInput('');
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [internalNumbers, agencyList, recentSms, allUsers] = await Promise.all([
        getInternalNumbers(),
        getAgencies(),
        getRecentSmsOperations(50).catch(() => []),
        getAllSystemUsers().catch(() => []),
      ]);
      setNumbers(internalNumbers);
      setAgencies(agencyList);
      setSmsOperations(recentSms);
      setTeamMembers(allUsers);
      const agentEntries = await Promise.all(
        agencyList.map(async (agency) => {
          try {
            const agencyAgents = await getAgencyUsersByRole(agency.id, 'agent');
            return [
              agency.id,
              agencyAgents.filter(
                (agent) =>
                  agent.status !== 'disabled' &&
                  agent.status !== 'suspended' &&
                  agent.isApproved
              ),
            ] as const;
          } catch {
            return [agency.id, []] as const;
          }
        })
      );
      setAgents(Object.fromEntries(agentEntries));
    } catch (err) {
      console.error('[Ets AMANI] Erreur chargement numéros internes :', err);
      setError('Impossible de charger les numéros internes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const agencyMap = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency])),
    [agencies]
  );

  const filteredNumbers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) {
      return numbers;
    }
    return numbers.filter((number) => {
      const agency = number.agencyId ? agencyMap.get(number.agencyId) : undefined;
      const agencyName = agency?.name ?? '';
      return [
        number.phoneNumber,
        number.operator,
        number.label ?? '',
        number.description ?? '',
        number.assignedUserName ?? '',
        agencyName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(value);
    });
  }, [numbers, search, agencyMap]);

  const resetForm = () => {
    setPhoneNumber('');
    setOperator('vodacom');
    setAgencyId('');
    setLabel('');
    setDescription('');
    setShowForm(false);
  };

  const handleCreate = async () => {
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone) {
      setError('Veuillez saisir le numéro interne.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createInternalNumber({
        phoneNumber: normalizedPhone,
        operator,
        agencyId: agencyId.trim() || null,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
        createdBy: 'directeur_general',
      });
      resetForm();
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Création numéro interne impossible :', err);
      setError('Impossible de créer le numéro interne.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (number: InternalNumber, selectedUserId: string) => {
    try {
      setActionId(number.id);
      setError(null);
      if (!selectedUserId) {
        await unassignInternalNumber(number.id);
      } else {
        const agencyAgents = number.agencyId ? agents[number.agencyId] ?? [] : [];
        const selectedAgent = agencyAgents.find(
          (agent) => agent.uid === selectedUserId
        );
        if (!selectedAgent) {
          throw new Error('Agent introuvable.');
        }
        await assignInternalNumber(
          number.id,
          selectedAgent.uid,
          selectedAgent.displayName
        );
      }
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Affectation numéro impossible :', err);
      setError('Impossible de modifier l affectation du numéro.');
    } finally {
      setActionId(null);
    }
  };

  const handleMonitoring = async (number: InternalNumber) => {
    try {
      setActionId(number.id);
      setError(null);
      await setMonitoringState(number.id, !number.monitoringEnabled);
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Modification surveillance impossible :', err);
      setError('Impossible de modifier la surveillance.');
    } finally {
      setActionId(null);
    }
  };

  const handleStatus = async (
    number: InternalNumber,
    status: InternalNumberStatus
  ) => {
    try {
      setActionId(number.id);
      setError(null);
      await updateInternalNumberStatus(number.id, status);
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Modification statut impossible :', err);
      setError('Impossible de modifier le statut.');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (number: InternalNumber) => {
    try {
      setActionId(number.id);
      setError(null);
      await deleteInternalNumber(number.id);
      setConfirmDeleteNumber(null);
      await loadData();
    } catch (err) {
      console.error('[Ets AMANI] Suppression numéro impossible :', err);
      setError('Impossible de supprimer le numéro interne.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <section
      className="rounded-3xl border border-slate-200 bg-white shadow-xl"
      aria-label="Gestion des numéros internes"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Numéros internes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gestion et supervision des numéros professionnels Ets AMANI.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Ajouter un numéro
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
              Fermer
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {showForm && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900">
                Ajouter un numéro interne
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Enregistrez un numéro professionnel officiellement utilisé par Ets AMANI.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Numéro de téléphone
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+243..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Opérateur
                </span>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as MobileOperator)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Agence
                </span>
                <select
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Sans agence</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Libellé
                </span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex. Numéro guichet Goma"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Description facultative..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        )}

        <div className="mb-5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un numéro, une agence, un agent..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
          />
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{numbers.length}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Actifs</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {numbers.filter((item) => item.status === 'active').length}
            </p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Surveillés</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">
              {numbers.filter((item) => item.monitoringEnabled).length}
            </p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Affectés</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {numbers.filter((item) => Boolean(item.assignedUserId)).length}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement des numéros internes...
            </div>
          </div>
        ) : filteredNumbers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <Phone className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 font-semibold text-slate-900">Aucun numéro interne</h3>
            <p className="mt-1 text-sm text-slate-500">Aucun numéro ne correspond aux critères actuels.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNumbers.map((number) => {
              const agency = number.agencyId ? agencyMap.get(number.agencyId) : undefined;
              const agencyAgents = number.agencyId ? agents[number.agencyId] ?? [] : [];
              const busy = actionId === number.id;
              return (
                <div key={number.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-slate-900">{number.phoneNumber}</span>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {operatorLabel(number.operator)}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(number.status)}`}>
                          {statusLabel(number.status)}
                        </span>
                        {number.monitoringEnabled && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            <Activity className="h-3 w-3" />
                            Surveillance
                          </span>
                        )}
                      </div>
                      {number.label && (
                        <p className="mt-1 text-sm font-medium text-slate-700">{number.label}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {agency?.name ?? 'Sans agence'}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {number.assignedUserName ? (
                            <UserAvatar
                              name={number.assignedUserName}
                              photoURL={
                                agencyAgents.find((a) => a.uid === number.assignedUserId)?.photoURL
                              }
                              size="xs"
                            />
                          ) : (
                            <UserRound className="h-3.5 w-3.5" />
                          )}
                          <span className="font-medium text-slate-700">
                            {number.assignedUserName ?? 'Non affecté'}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 xl:min-w-[360px]">
                      {number.agencyId && (
                        <select
                          value={number.assignedUserId ?? ''}
                          disabled={busy}
                          onChange={(e) => void handleAssign(number, e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                        >
                          <option value="">Aucun agent affecté</option>
                          {agencyAgents.map((agent) => (
                            <option key={agent.uid} value={agent.uid}>
                              {agent.displayName} {agent.function ? ` — ${agent.function}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleMonitoring(number)}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            number.monitoringEnabled
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <Activity className="h-3.5 w-3.5" />
                          {number.monitoringEnabled ? 'Désactiver' : 'Surveiller'}
                        </button>
                        <select
                          value={number.status}
                          disabled={busy}
                          onChange={(e) => void handleStatus(number, e.target.value as InternalNumberStatus)}
                          className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 outline-none"
                        >
                          {STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmDeleteNumber(number)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400 self-center" />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section Messagerie Interne & Collaboration */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Messagerie Interne & Collaboration d'Agence
                </h3>
                <p className="text-xs text-slate-500">
                  Canaux opérationnels, membres connectés et fil de coordination interne
                </p>
              </div>
            </div>
            {user && (
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 text-xs">
                <UserAvatar user={user} size="xs" showStatus isOnline={true} />
                <span className="font-semibold text-slate-700">{user.displayName}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Liste des Canaux & Liste des Membres */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Canaux de communication
                </p>
                <div className="space-y-1">
                  {COLLAB_CHANNELS.map((ch) => {
                    const isActive = activeChannelId === ch.id;
                    const lastSender = collabMessages
                      .filter((m) => m.channelId === ch.id)
                      .slice(-1)[0];
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setActiveChannelId(ch.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                          isActive
                            ? 'bg-slate-900 text-white font-bold shadow-xs'
                            : 'text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {lastSender ? (
                            <UserAvatar
                              name={lastSender.senderName}
                              photoURL={lastSender.senderPhotoURL}
                              size="xs"
                            />
                          ) : (
                            <Hash className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          )}
                          <span className="truncate">{ch.label}</span>
                        </div>
                        <span className="ml-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px]">
                          {ch.roleBadge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Membres & Intervenants ({teamMembers.length})
                  </p>
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {teamMembers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">Aucun membre chargé.</p>
                  ) : (
                    teamMembers.slice(0, 12).map((member) => (
                      <div
                        key={member.uid}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            name={member.displayName}
                            photoURL={member.photoURL}
                            email={member.email}
                            size="xs"
                            showStatus
                            isOnline={member.status === 'active'}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">
                              {member.displayName}
                            </p>
                            <p className="truncate text-[10px] text-slate-400 uppercase">
                              {member.role}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Fil de discussion avec bulles et avatars expéditeurs */}
            <div className="lg:col-span-2 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 min-h-[260px]">
              <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                {collabMessages.filter((m) => m.channelId === activeChannelId).length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Aucun message dans ce canal. Envoyez une note opérationnelle à l'équipe.
                  </div>
                ) : (
                  collabMessages
                    .filter((m) => m.channelId === activeChannelId)
                    .map((msg) => {
                      const isMe = msg.senderUid === user?.uid;
                      const matchedMember = teamMembers.find((u) => u.uid === msg.senderUid);
                      const resolvedPhoto =
                        (isMe ? user?.photoURL : matchedMember?.photoURL) ?? msg.senderPhotoURL;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${
                            isMe ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          <UserAvatar
                            name={msg.senderName}
                            photoURL={resolvedPhoto}
                            size="sm"
                          />
                          <div
                            className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                              isMe
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold">{msg.senderName}</span>
                              <span className="text-[10px] opacity-70">
                                {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="leading-relaxed">{msg.text}</p>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              <form onSubmit={handleSendCollabMessage} className="mt-3 flex items-center gap-2 pt-2 border-t border-slate-200/80">
                <UserAvatar user={user} size="xs" />
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Écrire un message ou une consigne à l'équipe..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Envoyer</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Section Flux SMS Opérateurs détectés */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Flux SMS Opérateurs détectés ({smsOperations.length})
              </h3>
              <p className="text-xs text-slate-500">
                Messages financiers Mobile Money captés et associés aux numéros internes surveillés
              </p>
            </div>
          </div>

          {smsOperations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              Aucun SMS opérateur enregistré pour le moment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {smsOperations.slice(0, 15).map((sms) => (
                <div key={sms.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold uppercase text-slate-900">{sms.operator}</span>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                        {sms.transactionType}
                      </span>
                      {sms.amount !== null && sms.amount !== undefined && (
                        <span className="font-bold text-slate-900">
                          {sms.amount.toLocaleString('fr-FR')} {sms.currency || ''}
                        </span>
                      )}
                      {sms.transactionReference && (
                        <span className="font-mono text-[11px] text-slate-500">
                          Réf: {sms.transactionReference}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-600 line-clamp-2">{sms.rawMessage}</p>
                  </div>
                  <div className="text-[11px] text-slate-400 sm:text-right shrink-0">
                    <p>{new Date(sms.receivedAt).toLocaleString('fr-FR')}</p>
                    <p className="font-medium text-slate-500">Statut : {sms.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            Les numéros internes sont des ressources professionnelles contrôlées par Ets AMANI. La surveillance permet ensuite de relier les SMS opérateur aux opérations, au billetage et aux rapports.
          </p>
        </div>
      </div>

      {confirmDeleteNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Supprimer le numéro {confirmDeleteNumber.phoneNumber} ?
            </h3>
            <p className="text-xs text-slate-600">
              Cette action est irréversible et retirera ce numéro de la flotte supervisée.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteNumber(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={actionId === confirmDeleteNumber.id}
                onClick={() => void handleDelete(confirmDeleteNumber)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
