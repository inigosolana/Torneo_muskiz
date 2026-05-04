import { supabase } from './supabaseClient';
import { Team, Player, Match } from '../types';

export const teamService = {
    async getTeams(): Promise<Team[]> {
        const { data, error } = await supabase
            .from('teams')
            .select(`
        *,
        players (*)
      `);

        if (error) {
            console.error('Error fetching teams:', error);
            return [];
        }

        // Map snake_case from DB to camelCase in app
        return data.map((t: any) => ({
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
            status: t.status || 'pending',
            players: t.players.map((p: any) => ({
                id: p.id,
                name: p.name,
                surnames: p.surnames,
                dniNumber: p.dni_number,
                birthDate: p.birth_date,
                number: p.number,
                position: p.position,
                verified: p.verified,
                dniStatus: p.dni_status,
                insuranceStatus: p.insurance_status,
                avatarUrl: p.avatar_url,
                dniUrl: p.dni_url,
                insuranceUrl: p.insurance_url
            }))
        }));
    },

    async registerTeam(team: Partial<Team>, receiptFile?: File | null): Promise<Team | null> {
        const teams = await this.registerTeams([team], receiptFile);
        return teams.length > 0 ? teams[0] : null;
    },

    async registerTeams(newTeams: Partial<Team>[], receiptFile?: File | null): Promise<Team[]> {
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
                return [];
            }
            const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
            receiptUrl = urlData.publicUrl;
        }

        // 1. Create a parent Registration record for the webhook to group these teams
        let regId: string | undefined;
        if (newTeams.length > 0) {
            const { data: regData, error: regError } = await supabase
                .from('registrations')
                .insert({
                    manager_name: newTeams[0].managerName,
                    manager_email: newTeams[0].managerEmail
                })
                .select()
                .single();
            
            if (!regError) regId = regData.id;
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
            manager_email: team.managerEmail,
            registration_id: regId
        }));

        const { data, error } = await supabase.from('teams').insert(insertData).select();

        if (error) {
            console.error('Error registering teams:', error);
            return [];
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
                payment_feedback: team.paymentFeedback
            })
            .eq('id', team.id);

        if (error) console.error('Error updating team:', error);
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
        const { data, error } = await supabase
            .from('players')
            .insert([{
                team_id: teamId,
                name: player.name,
                surnames: player.surnames,
                dni_number: player.dniNumber || null,
                birth_date: player.birthDate || null,
                number: player.number,
                position: player.position,
                dni_status: player.dniStatus || 'EMPTY',
                insurance_status: player.insuranceStatus || 'EMPTY'
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
        const { error } = await supabase
            .from('players')
            .update({
                name: player.name,
                surnames: player.surnames,
                dni_number: player.dniNumber,
                birth_date: player.birthDate,
                number: player.number,
                position: player.position,
                verified: player.verified,
                dni_status: player.dniStatus,
                insurance_status: player.insuranceStatus,
                dni_url: player.dniUrl,
                insurance_url: player.insuranceUrl,
                avatar_url: player.avatarUrl
            })
            .eq('id', player.id);

        if (error) console.error('Error updating player:', error);
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

export const matchService = {
    async getMatches(): Promise<Match[]> {
        const { data, error } = await supabase
            .from('matches')
            .select('*');

        if (error) {
            console.error('Error fetching matches:', error);
            return [];
        }

        return data.map((m: any) => ({
            id: m.id,
            time: m.time,
            court: m.court,
            teamA: m.team_a,
            teamB: m.team_b,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status,
            round: m.round,
            report: m.report
        }));
    },

    async saveMatches(matches: Match[]): Promise<void> {
        // Basic implementation: delete existing and insert new for bracket regen
        await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to clear

        const { error } = await supabase
            .from('matches')
            .insert(matches.map(m => ({
                time: m.time,
                court: m.court,
                team_a: m.teamA,
                team_b: m.teamB,
                score_a: m.scoreA,
                score_b: m.scoreB,
                status: m.status,
                round: m.round,
                report: m.report
            })));

        if (error) console.error('Error saving matches:', error);
    }
};
