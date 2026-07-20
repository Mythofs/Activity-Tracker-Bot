const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const queryRetry = require('../../queryRetry.js');
const safeFetch = require("../../safeFetch.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('facactivity').setDescription('Provides activity for specified faction(s)')
        .addIntegerOption((option) => option.setName("id").setDescription("The faction id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The faction id to compare")),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid");
            const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
            const activityData = await queryRetry("SELECT name, timestamp, numactive FROM faction_activity WHERE id = ?", [id]);
            if(activityData.length == 0)
                return await interaction.editReply(`No faction ${id} found`);
            let data, content;
            if(oppid) {
                const oppActivityData = await queryRetry("SELECT name, timestamp, numactive FROM faction_activity WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.editReply(`No faction ${oppid} found`);
                const name = activityData[0].name;
                const oppname = oppActivityData[0].name;
                data = {
                    datasets: [
                    {
                        label: name,
                        data: activityData.map(data => ({"x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive})),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    },
                    {
                        label: oppname,
                        data: oppActivityData.map(data => ({"x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive})),
                        borderColor: "rgb(0,0,255)",
                        fill: false
                    }]
                }
                let sum = 0;
                activityData.forEach(data => sum += data.numactive);
                let oppsum = 0;
                oppActivityData.forEach(data => oppsum += data.numactive);
                content = `${name}: ${(sum / activityData.length).toFixed(2)} average active members
                    \n${oppname}: ${(oppsum / oppActivityData.length).toFixed(2)} average active members`;
            }
            else {
                data = {
                    datasets: [
                    {
                        label: activityData[0].name,
                        data: activityData.map(data => ({"x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive})),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    }]
                }
                let sum = 0;
                activityData.forEach(data => sum += data.numactive);
                content = `${activityData[0].name}: ${(sum / activityData.length).toFixed(2)} average active memebers`;
            }
            const activityChart = new QuickChart().setVersion("3")
            .setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        x: {
                            type: "time",
                            time: {
                                displayFormats: {
                                    millisecond: "M/d HH:mm",
                                }
                            },
                            title: {
                                display: true,
                                text: "Time"
                            },
                        },
                        y: {
                            min: 0,
                            max: 100,
                            title: {
                                display: true,
                                text: "Members active"
                            },
                        }
                    }
                }
            })
            .setWidth(800).setHeight(600);
            const activityGraph = await activityChart.toBinary();
            if(!oppid)
                return interaction.editReply({content: content, files: [{attachment: activityGraph, name: "activityGraph.png"}]});
            const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${id}`);
            if(stats == null || stats.status == false)
                return interaction.editReply(`Error fetching tornstats for ${id}`);
            const oppstats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppid}`);
            if(oppstats == null || stats.status == false)
                return interaction.editReply(`Error fetching tornstats for ${oppid}`);
            const allstats = [],  missingstats = [];
            for(const [id, member] of Object.entries(stats.faction.members))
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    allstats.push({"id": Number(id), "stats": member.spy.total});
                else
                    missingstats.push(id);
            for(const [id, member] of Object.entries(oppstats.faction.members))
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    allstats.push({"id": Number(id), "stats": member.spy.total});
                else
                    missingstats.push(id);
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingstats.join()}`);
            ffscouterStats.forEach(stat => allstats.push({"id": stat.player_id, "stats": stat.bs_estimate}));
            allstats.sort((a, b) => b.stats - a.stats);
            const indivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ?", [id]);
            const oppIndivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ?", [oppid]);
            const activityMap = new Map();
            for(const data of indivActivity)
                if(activityMap.has(data.id)) {
                    activityMap.get(data.id).count += data.active;
                    activityMap.get(data.id).amount++;
                }
                else
                    activityMap.set(data.id, {"count": data.active, "amount": 1, "opp": false});
            for(const data of oppIndivActivity)
                if(activityMap.has(data.id)) {
                    activityMap.get(data.id).count += data.active;
                    activityMap.get(data.id).amount++;
                }
                else
                    activityMap.set(data.id, {"count": data.active, "amount": 1, "opp": true});
            const percentiles = [];
            let i = 0;
            const intervalSize = allstats.length / 10;
            while(i < allstats.length) {
                i += intervalSize;
                let slice;
                if(i + intervalSize >= allstats.length) {
                    slice = allstats.slice(i - intervalSize);
                    i = allstats.length;
                }
                else
                    slice = allstats.slice(i - intervalSize, i);
                let activitySum = 0, oppActivitySum = 0, length = 0, oppLength = 0;
                for(const stat of slice) {
                    const activity = activityMap.get(stat.id);
                    if(!activity.opp) {
                        activitySum += activity.count;
                        length += activity.amount;
                    }
                    else {
                        oppActivitySum += activity.count;
                        oppLength += activity.amount;
                    }
                }
                percentiles.push({"max": slice[0].stats, "min": slice[slice.length - 1].stats, "activity": activitySum / length * 100, "oppActivity": oppActivitySum / oppLength * 100});
            }
            const formatter = new Intl.NumberFormat("en-US", {notation: "compact"});
            const distData = {
                labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
                datasets: [{
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
            const distChart = new QuickChart().setVersion("3")
            .setConfig({
                type: "bar",
                data: distData,
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
                    },
                }
            })
            .setWidth(800).setHeight(600);
            const distGraph = await distChart.toBinary();
            return interaction.editReply({content: content, files: [{attachment: activityGraph, name: "activityGraph.png"}, {attachment: distGraph, name: "distGraph.png"}]});
        }
        catch(e) {
            console.log(e);
            interaction.editReply(`Error while sending activity graph ${e}`);
        }
    },
};