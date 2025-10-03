import { InvitationWithOrganization } from '../types/database';
import { Check, X } from 'lucide-react';

interface PendingInvitationsProps {
  invitations: InvitationWithOrganization[];
  onAccept: (invitationId: string) => Promise<void>;
  onDecline: (invitationId: string) => Promise<void>;
  processingId: string | null;
}

export default function PendingInvitations({
  invitations,
  onAccept,
  onDecline,
  processingId
}: PendingInvitationsProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Pozvánky do týmů</h1>
        <p className="text-gray-600 mb-8">
          Byli jste pozváni do následujících týmů. Vyberte, do kterých se chcete přidat.
        </p>

        <div className="space-y-4">
          {invitations.map(invitation => (
            <div
              key={invitation.id}
              className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {invitation.organization?.name ?? 'Neznámá organizace'}
                </h2>
                <p className="text-sm text-gray-500">
                  Role: <span className="font-medium text-gray-700">{invitation.role}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Pozvánka vytvořena: {new Date(invitation.created_at).toLocaleDateString('cs-CZ')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onDecline(invitation.id)}
                  disabled={processingId === invitation.id}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-60"
                >
                  <X className="w-4 h-4" />
                  Odmítnout
                </button>
                <button
                  onClick={() => onAccept(invitation.id)}
                  disabled={processingId === invitation.id}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a192f] text-white rounded-lg hover:bg-opacity-90 transition disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  Přijmout
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-6">
          Pokud žádný tým nepřijmete, vytvoříme vám novou organizaci automaticky.
        </p>
      </div>
    </div>
  );
}
