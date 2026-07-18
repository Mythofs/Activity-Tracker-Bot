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
            const oppstats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppid}`);
            const statarray = [];
            const oppstatarray = [];
            const missingstats = [];
            for(const [id, member] of Object.entries(stats.faction.members)) {
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    statarray.push({"id": id, "stats": member.spy.total});
                else
                    missingstats.push(id);
            }
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            ffscouterStats.forEach(stat => statarray.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            missingstats.length = 0;
            for(const [id, member] of Object.entries(oppstats.faction.members)) {
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    oppstatarray.push({"id": id, "stats": member.spy.total});
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
            const maxlength = Math.max(statarray.length, oppstatarray.length);
            chart.setConfig({
                type: 'line',
                data: statdata,
                options: {
                    scales: {
                        x: {
                            type: "linear",
                            min: 0.5,
                            max: maxlength + 0.5,
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
                                        return value.toLocaleString();
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
            const [activityData] = await queryRetry("SELECT * FROM individual_activity WHERE facid = ? OR facid = ?", [id, oppid]);
            if(activityData.length === 0)
                return interaction.editReply({files: [{attachment: statgraph, name: "statcomparison.png"}]});
            const activityMap = new Map();
            for(const data of activityData)
                if(activityMap.has(data.id)) {
                    activityMap.get(data.id).count += data.active;
                    activityMap.get(data.id).amount++;
                }
                else
                    activityMap.set(data.id, {"count": data.active, "amount": 1});
            const allstats = [];
            statarray.forEach(stat => allstats.push({"stats": stat, "opp": false}));
            oppstatarray.forEach(stat => allstats.push({"stats": stat, "opp": true}));
            allstats.sort((a, b) => b.stats.stats - a.stats.stats);
            const percentiles = [];
            let i = 0;
            while(i < allstats.length) {
                let slice;
                if(allstats.length - i < allstats.length / 5) {
                    slice = allstats.slice(i);
                    i = allstats.length;
                }
                else {
                    slice = allstats.slice(i, i + allstats.length / 10);
                    i += allstats.length / 10;
                }
                let count = 0, activitySum = 0, length = 0, oppActivitySum = 0, oppLength = 0;
                for(const stat of slice) {
                    const activity = activityMap.get(stat.id);
                    if(!stat.opp) {
                        count++;
                        activitySum += activity.count;
                        length += activity.amount;
                    }
                    else {
                        oppActivitySum += activity.count;
                        oppLength += activity.amount;
                    }
                }
                percentiles.push({"count": count, "max": slice[0].stats.stats, "min": slice[slice.length - 1].stats.stats, "activity": activitySum / length * 100, "oppActivity": oppActivitySum / oppLength * 100});
            }
            const formatter = new Intl.NumberFormat("en-US", {notation: "compact"});
            const data = {
                labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
                datasets = [{
                    label: stats.faction.name,
                    data: percentiles.map(slice => slice.activity),
                    backgroundColor: "rgb(255, 0, 0)",
                },
                {
                    label: oppstats.faction.name,
                    data: percentiles.map(slice => slice.oppActivity),
                    backgroundColor: "rgb(0, 0, 255)",
                }]
            }
            const barchart = new QuickChart().setVersion("3");
            barchart.setConfig({
                type: "bar",
                data: data,
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
                                text: "Average Activity"
                            },
                            min: 0,
                            max: 100,
                        }
                    }
                }
            });
            barchart.setWidth(800);
            barchart.setHeight(600);
            const activityGraph = await barchart.toBinary();
            return interaction.editReply({files: [{attachment: statgraph, name: "statcomparison.png"}, {attachment: activityGraph, name: "activitygraph.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(e);
        }
    },
};