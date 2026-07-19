const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const safeFetch = require("../../safeFetch.js");
const queryRetry = require("../../queryRetry.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('statcomparison').setDescription('Provides stat comparison for specified factions')
        .addIntegerOption((option) => option.setName("id").setDescription("The faction id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The faction id to compare").setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid", true);
            const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${id}`);
            if(!stats.status)
                return interaction.editReply(`No faction ${id} found`);
            const oppstats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppid}`);
            if(!oppstats.status)
                return interaction.editReply(`No faction ${oppid} found`);
            const statarray = [];
            const oppstatarray = [];
            const missingstats = [];
            for(const [id, member] of Object.entries(stats.faction.members)) {
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    statarray.push({"id": Number(id), "stats": member.spy.total});
                else
                    missingstats.push(id);
            }
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            ffscouterStats.forEach(stat => statarray.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            missingstats.length = 0;
            for(const [id, member] of Object.entries(oppstats.faction.members)) {
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    oppstatarray.push({"id": Number(id), "stats": member.spy.total});
                else
                    missingstats.push(id);
            }
            const oppffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            oppffscouterStats.forEach(stat => oppstatarray.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            statarray.sort((a, b) => b.stats - a.stats);
            oppstatarray.sort((a, b) => b.stats - a.stats);
            const statdata = {
                datasets: [
                {
                    label: stats.faction.name,
                    data: statarray.map((data, i) => ({"x": i + 1, "y": data.stats})),
                    borderColor: "rgb(255, 0, 0)",
                    fill: false,
                },
                {
                    label: oppstats.faction.name,
                    data: oppstatarray.map((data, i) => ({"x": i + 1, "y": data.stats})),
                    borderColor: "rgb(0, 0, 255)",
                    fill: false,
                }]
            };
            const chart = new QuickChart().setVersion("3");
            const formatter = new Intl.NumberFormat("en-US", {notation: "compact"});
            chart.setConfig({
                type: 'line',
                data: statdata,
                options: {
                    scales: {
                        x: {
                            type: "linear",
                            min: 0.5,
                            max: Math.max(statarray.length, oppstatarray.length) + 0.5,
                            title: {
                                display: true,
                                text: "Rank in faction"
                            },
                        },
                        y: {
                            type: "logarithmic",
                            min: Math.min(statarray[statarray.length - 1].stats, oppstatarray[oppstatarray.length - 1].stats) * 0.9,
                            max: Math.max(statarray[0].stats, oppstatarray[0].stats) * 1.1,
                            title: {
                                display: true,
                                text: "Total battlestats"
                            },
                            ticks: {
                                callback: function(value) {
                                    const leading = value.toString().replaceAll("0", "");
                                    if(leading == "1" || leading == "2" || leading == "5")
                                        return formatter.format(value);
                                    return null;
                                }
                            }
                        }
                    }
                }
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const statgraph = await chart.toBinary();
            const allstats = [];
            statarray.forEach(stat => allstats.push({"stats": stat, "opp": false}));
            oppstatarray.forEach(stat => allstats.push({"stats": stat, "opp": true}));
            allstats.sort((a, b) => b.stats.stats - a.stats.stats);
            const percentiles = [];
            const intervalSize = allstats.length / 10;
            let i = 0;
            while(i < allstats.length) {
                i += intervalSize;
                let slice;
                if(i + intervalSize >= allstats.length) {
                    slice = allstats.length(i - intervalSize);
                    i = allstats.length;
                }
                else
                    slice = allstats.slice(i - intervalSize, i);
                let count = 0, oppcount = 0;
                for(const stat of slice)
                    if(!stat.opp)
                        count++;
                    else
                        oppcount++;
                percentiles.push({"count": count, "oppcount": oppcount, "max": slice[0].stats.stats, "min": slice[slice.length - 1].stats.stats});
            }
            const distdata = {
                labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
                datasets: [{
                    label: stats.faction.name,
                    data: percentiles.map(slice => slice.count),
                    backgroundColor: "rgb(255, 0, 0)",
                },
                {
                    label: oppstats.faction.name,
                    data: percentiles.map(slice => slice.oppcount),
                    backgroundColor: "rgb(0, 0, 255)",
                }]
            }
            const distChart = new QuickChart().setVersion("3")
            .setConfig({
                type: "bar",
                data: distdata,
                options: {
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: "Stat Percentiles"
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: "Number of members"
                            },
                            min: 0,
                            max: 100,
                        }
                    }
                }
            })
            .setWidth(800).setHeight(600);
            const distGraph = await distChart.toBinary();
            return interaction.editReply({ files: [{attachment: statgraph, name: "statcomparison.png"}, {attachment: distGraph, name: "statdistribution.png"}]});
        }
        catch(e) {
            console.log(e);
            return interaction.editReply("Error:" + e);
        }
    },
};