import { supabase } from './supabaseClient';
import { Team, Player, Match } from '../types';
import { applySmBitxiBlueFlowGroupSwap } from '../utils/smBitxiBlueFlowGroupSwap';
import { normalizeDniInput, resolveDniStatusFromNumber } from '../utils/dniValidation';
import { databaseRowToMatch, enrichMatchGoalsFromSetScores, matchToDatabaseRow } from './matchDbMapper';

export const teamService = {
    async getTeams(): Promise<Team[]> {
        const base = await supabase.from('teams').select(`*, players (*)`);
        if (base.error) {
            console.error('Error fetching teams:', base.error);
            return [];
        }
        const data = base.data ?? [];

        const byRegistrationId = new Map<string, string>();
        const byManagerEmail = new Map<string, string>();

        const registrationIds = [...new Set(
            data
                .map((t: any) => String(t.registration_id ?? '').trim())
                .filter(Boolean)
        )];

        if (registrationIds.length > 0) {
            const regs = await supabase
                .from('registrations')
                .select('id, manager_phone, manager_email')
                .in('id', registrationIds);

            if (regs.error) {
                console.warn('Could not read registrations for manager phone:', regs.error.message);
            } else {
                for (const r of regs.data ?? []) {
                    const phone = String(r.manager_phone ?? '').trim();
                    if (!phone) continue;
                    if (r.id) byRegistrationId.set(String(r.id), phone);
                    const email = String(r.manager_email ?? '').trim().toLowerCase();
                    if (email) byManagerEmail.set(email, phone);
                }
            }
        }

        const registrationPhone = (t: any): string | undefined => {
            const teamPhone = String(t.manager_phone ?? '').trim();
            if (teamPhone) return teamPhone;
            const regId = String(t.registration_id ?? '').trim();
            if (regId && byRegistrationId.has(regId)) return byRegistrationId.get(regId);
            const email = String(t.manager_email ?? '').trim().toLowerCase();
            if (email && byManagerEmail.has(email)) return byManagerEmail.get(email);
            return undefined;
        };

        // Map snake_case from DB to camelCase in app
        const mapped = data.map((t: any) => ({
            id: t.id,
            name: t.name,
            city: t.city,
            division: t.division,
            paymentStatus: t.payment_status,
            paymentMethod: t.payment_method,
            fee: t.fee,
            logoUrl: t.logo_url,
            receiptUrl: t.receipt_url,
            managerName: t.manager_name,
            managerEmail: t.manager_email,
            managerPhone: registrationPhone(t),
            status: t.status || 'pending',
            competitionGroup: t.competition_group ?? null,
            players: t.players.map((p: any) => ({
                id: p.id,
                name: p.name,
                surnames: p.surnames,
                dniNumber: p.dni_number,
                birthDate: p.birth_date,
                number: p.number,
                position: p.position,
                role: (p.role as Player['role']) || 'PLAYER',
                verified: p.verified,
                dniStatus: p.dni_status,
                insuranceStatus: p.insurance_status,
                avatarUrl: p.avatar_url,
                dniUrl: p.dni_url,
                insuranceUrl: p.insurance_url,
                signatureUrl: p.signature_url
            }))
        }));
        return applySmBitxiBlueFlowGroupSwap(mapped);
    },

    async registerTeam(team: Partial<Team>, receiptFile?: File | null): Promise<Team | null> {
        const teams = await this.registerTeams([team], receiptFile);
        return teams.length > 0 ? teams[0] : null;
    },

    async registerTeams(
        newTeams: Partial<Team>[],
        receiptFile?: File | null,
        meta?: { authUserId?: string | null; managerLoginPassword?: string | null }
    ): Promise<Team[]> {
        const authUserId = meta?.authUserId ?? null;
        const managerLoginPassword = meta?.managerLoginPassword?.trim() || null;
        // Upload receipt file once if provided
        let receiptUrl: string | undefined;
        if (receiptFile) {
            if (receiptFile.size > 5 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máx 5MB)');
            const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
            if (!allowedTypes.includes(receiptFile.type)) throw new Error('Formato de archivo no permitido');

            const fileExt = receiptFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('receipts').upload(fileName, receiptFile);
            if (uploadError) {
                console.error('Error uploading receipt:', uploadError);
                throw new Error(`Error subiendo justificante: ${uploadError.message}`);
            }
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
            receiptUrl = urlData.publicUrl;
        }

        if (newTeams.length === 0) {
            throw new Error('Debes añadir al menos un equipo.');
        }

        const insertData = newTeams.map(team => ({
            name: team.name,
            city: team.city,
            division: team.division,
            payment_status: 'WAITING_VALIDATION', // Set to WAITING_VALIDATION for transfer flow
            payment_method: team.paymentMethod || 'TRANSFER',
            fee: team.fee,
            receipt_url: receiptUrl || null,
            manager_name: team.managerName,
            manager_email: team.managerEmail
        }));

        const { data, error } = await supabase.rpc('create_registration_with_teams', {
            p_manager_name: newTeams[0].managerName || null,
            p_manager_email: newTeams[0].managerEmail || null,
            p_manager_phone: newTeams[0].managerPhone || null,
            p_teams: insertData,
            p_auth_user_id: authUserId ?? null,
            p_manager_login_password: managerLoginPassword,
        });

        if (error) {
            console.error('Error registering teams:', error);
            throw new Error(`No se pudieron guardar los equipos: ${error.message}`);
        }

        if (!data || data.length === 0) {
            throw new Error('No se guardó ningún equipo. Inténtalo de nuevo.');
        }

        return data.map((t: any) => ({ ...t, players: [] }));
    },

    async updateTeam(team: Team): Promise<void> {
        const { error } = await supabase
            .from('teams')
            .update({
                name: team.name,
                city: team.city,
                division: team.division,
                payment_status: team.paymentStatus,
                payment_method: team.paymentMethod,
                logo_url: team.logoUrl,
                status: team.status,
                payment_feedback: team.paymentFeedback,
                competition_group: team.competitionGroup ?? null,
            })
            .eq('id', team.id);

        if (error) {
            console.error('Error updating team:', error);
            throw new Error(error.message);
        }
    },

    async deleteTeam(teamId: string): Promise<void> {
        // Supabase foreign keys with ON DELETE CASCADE will handle players if configured,
        // otherwise we might need to delete them manually. Assuming CASCADE for now.
        const { error } = await supabase
            .from('teams')
            .delete()
            .eq('id', teamId);

        if (error) {
            console.error('Error deleting team:', error);
            throw new Error(error.message);
        }
    },

    async addPlayer(teamId: string, player: Partial<Player>): Promise<Player> {
        const dniNumber = normalizeDniInput(player.dniNumber) || null;
        const dni_status = resolveDniStatusFromNumber(dniNumber, player.dniStatus);
        const { data, error } = await supabase
            .from('players')
            .insert([{
                team_id: teamId,
                name: player.name,
                surnames: player.surnames,
                dni_number: dniNumber,
                birth_date: player.birthDate || null,
                number: player.number,
                position: player.position,
                dni_status,
                insurance_status: player.insuranceStatus || 'EMPTY',
                role: player.role || 'PLAYER',
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding player:', error);
            throw new Error(error.message);
        }

        // Map back to frontend model if necessary
        return {
            id: data.id,
            teamId: data.team_id,
            name: data.name,
            surnames: data.surnames,
            dniNumber: data.dni_number,
            birthDate: data.birth_date,
            number: data.number,
            position: data.position,
            dniStatus: data.dni_status,
            insuranceStatus: data.insurance_status,
            dniUrl: data.dni_url,
            insuranceUrl: data.insurance_url,
            avatarUrl: data.avatar_url,
            role: data.role || 'PLAYER',
            verified: data.verified
        };
    },

    async updatePlayer(player: Player): Promise<void> {
        const { data: existing } = await supabase
            .from('players')
            .select('dni_number, dni_status')
            .eq('id', player.id)
            .maybeSingle();

        const dni_number = normalizeDniInput(player.dniNumber) || null;
        const prevDni = existing?.dni_number ?? null;
        const dniUnchanged = dni_number === normalizeDniInput(prevDni);
        const manualReview =
            dniUnchanged &&
            (player.dniStatus === 'REJECTED' || player.dniStatus === 'APPROVED') &&
            player.dniStatus !== existing?.dni_status;

        const dni_status: Player['dniStatus'] = manualReview
            ? player.dniStatus
            : resolveDniStatusFromNumber(dni_number, existing?.dni_status, prevDni);
        const { error } = await supabase
            .from('players')
            .update({
                name: player.name,
                surnames: player.surnames,
                dni_number,
                birth_date: player.birthDate,
                number: player.number,
                position: player.position,
                verified: player.verified,
                dni_status,
                insurance_status: player.insuranceStatus,
                dni_url: player.dniUrl,
                insurance_url: player.insuranceUrl,
                avatar_url: player.avatarUrl,
                role: player.role || 'PLAYER',
            })
            .eq('id', player.id);

        if (error) {
            console.error('Error updating player:', error);
            throw new Error(error.message);
        }
    },

    async deletePlayer(playerId: string): Promise<void> {
        const { error } = await supabase
            .from('players')
            .delete()
            .eq('id', playerId);

        if (error) {
            console.error('Error deleting player:', error);
            throw new Error(error.message);
        }
    }
};

/** Fila `matches` de Supabase → modelo `Match`. */
export function mapSupabaseMatchRow(m: Record<string, unknown>): Match {
    return databaseRowToMatch(m);
}

export const matchService = {
    async getMatches(): Promise<Match[]> {
        const { data, error } = await supabase
            .from('matches')
            .select('*');

        if (error) {
            console.error('Error fetching matches:', error);
            return [];
        }

        return (data ?? []).map((m: Record<string, unknown>) => enrichMatchGoalsFromSetScores(mapSupabaseMatchRow(m)));
    },

    async getMatchById(id: string): Promise<Match | null> {
        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            console.error('Error fetching match:', error);
            return null;
        }
        if (!data) return null;

        return enrichMatchGoalsFromSetScores(mapSupabaseMatchRow(data as Record<string, unknown>));
    },

    async saveMatches(matches: Match[]): Promise<void> {
        await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (matches.length === 0) return;

        const teams = await teamService.getTeams();
        const rows = matches.map((m) => {
            const row = matchToDatabaseRow(m, teams);
            if (UUID_RX.test(m.id)) row.id = m.id;
            return row;
        });

        const { error } = await supabase.from('matches').insert(rows);
        if (error) {
            console.error('Error saving matches:', error);
            throw new Error(error.message);
        }
    },

    async updateMatchReferees(matchId: string, referees: string): Promise<void> {
        const { error } = await supabase
            .from('matches')
            .update({ referees: referees.trim() || null })
            .eq('id', matchId);

        if (error) {
            console.error('Error updating referees:', error);
            throw new Error(error.message);
        }
    },

    /** Marca todos los partidos como visibles en la web (`is_public = true`). */
    async makeAllMatchesPublic(): Promise<void> {
        const { error } = await supabase
            .from('matches')
            .update({ is_public: true })
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) {
            console.error('Error makeAllMatchesPublic:', error);
            throw new Error(error.message);
        }
    },
};
