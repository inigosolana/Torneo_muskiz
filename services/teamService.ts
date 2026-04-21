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
                avatarUrl: p.avatar_url
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

        const insertData = newTeams.map(team => ({
            name: team.name,
            city: team.city,
            division: team.division,
            payment_status: 'PENDING',
            fee: team.fee,
            receipt_url: receiptUrl || null,
            manager_name: team.managerName,
            manager_email: team.managerEmail,
            password: team.password
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
                logo_url: team.logoUrl
            })
            .eq('id', team.id);

        if (error) console.error('Error updating team:', error);
    },

    async addPlayer(teamId: string, player: Partial<Player>): Promise<void> {
        const { error } = await supabase
            .from('players')
            .insert([{
                team_id: teamId,
                name: player.name,
                surnames: player.surnames,
                dni_number: player.dniNumber,
                birth_date: player.birthDate,
                number: player.number,
                position: player.position,
                dni_status: 'EMPTY',
                insurance_status: 'EMPTY'
            }]);

        if (error) console.error('Error adding player:', error);
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
