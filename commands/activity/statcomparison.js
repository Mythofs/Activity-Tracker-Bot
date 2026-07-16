const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const db = require("../../db.js");
const safeFetch = require("../../safeFetch.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('statcomparison').setDescription('Provides stat comparison for specified factions')
        .addIntegerOption((option) => option.setName("id").setDescription("The faction id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The faction id to compare")),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid", true);
            const activity = await db.execute("SELECT id, name, timestamp, active FROM individual_activity WHERE facid = ?", [id]);
            const oppactivity = await db.exeucte("SELECT id, name timestamp, active FROM individual_activity WHERE facid = ?", [oppid]);
            const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${id}`);
            const oppstats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppid}`);
            const statarray = [];
            const oppstatarray = [];
            const missingstats = [];
            const formatter = new Intl.NumberFormat("en-US", {notation: "compact"});
            for(const data of activity) {
                const playerid = String(data.id);
                if(playerid in stats.faction.members && "spy" in stats.faction.members[playerid] && Math.floor(Date.now() / 1000) - stats.faction.members[playerid].spy.timestamp < 604800)
                    statarray.push({"id": data.id, "stats": stats.faction.members[playerid].spy.total});
                else
                    missingstats.push(data.id);
            }
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            ffscouterStats.forEach(stat => statarray.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            missingstats.length = 0;
            for(const data of oppactivity) {
                const playerid = String(data.id);
                if(playerid in oppstats.faction.members && "spy" in oppstats.faction.members[playerid] && Math.floor(Date.now() / 1000) - oppstats.faction.members[playerid].spy.timestamp < 604800)
                    oppstatarray.push({"id": data.id, "stats": oppstats.faction.members[playerid].spy.total});
                else
                    missingstats.push(data.id);
            }
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            ffscouterStats.forEach(stat => oppstatarray.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            statarray.sort((a, b) => a.stats - b.stats);
            oppstatarray.sort((a, b) => a.stats - b.stats);
            let labels;
            if(statarray.length > oppstatarray.length)
                labels = statarray.map((_, i) => i + 1);
            else
                labels = oppstatarray.map((_, i) => i + 1);
            const chart = new QuickChart();
            const data = {
                labels: labels,
                datasets: [
                {
                    label: stats.faction.name,
                    data: statarray.map(data => data.stats),
                    borderColor: "rgb(255, 0, 0)",
                    fill: false
                },
                {
                    label: oppstats.faction.name,
                    data: oppstatarray.map(data => data.stats),
                    borderColor: "rgb(0, 0, 255)",
                    fill: false
                }]
            };
            chart.setConfig({
                type: 'line',
                data: data,
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const buffer = await chart.toBinary();
            return interaction.editReply({files: [{attachment: buffer, name: "statcomparison.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(`Error while sending activity graph ${e}`);
        }
    },
};