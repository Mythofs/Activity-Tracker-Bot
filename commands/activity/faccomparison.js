const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const safeFetch = require("../../safeFetch.js");
const queryRetry = require("../../queryRetry.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('faccomparison').setDescription('Provides stat and activity comparison for specified factions')
        .addIntegerOption((option) => option.setName("id").setDescription("The faction id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The faction id to compare").setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const myId = interaction.options.getInteger("id", true);
            const oppId = interaction.options.getInteger("oppid");
            const myStats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${myId}`);
            if(!myStats || !myStats.status)
                return interaction.editReply(`No faction ${myId} found`);
            const myStatArray = [];
            const missingStats = [];
            for(const [id, member] of Object.entries(myStats.faction.members))
                if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                    myStatArray.push({ "id": Number(id), "stats": member.spy.total, "opp": false });
                else
                    missingStats.push(id);
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingStats.join()}`);
            ffscouterStats.forEach(stat => myStatArray.push({ "id": stat.player_id, "stats": stat.bs_estimate, "opp": false }));
            myStatArray.sort((a, b) => b.stats - a.stats);
            missingStats.length = 0;
            let oppStats, oppStatArray = [];
            if(oppId) {
                oppStats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppId}`);
                if(!oppStats || !oppstats.status)
                    return interaction.editReply(`No faction ${myId} found`);
                for(const [id, member] of Object.entries(oppStats.faction.members))
                    if("spy" in member && Math.floor(Date.now() / 1000) - member.spy.timestamp < 604800)
                        oppStatArray.push({ "id": Number(id), "stats": member.spy.total, "opp": true });
                    else
                        missingStats.push(id);
                const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingStats.join()}`);
                ffscouterStats.forEach(stat => oppStatArray.push({ "id": stat.player_id, "stats": stat.bs_estimate, "opp": true }));
                oppStatArray.sort((a, b) => b.stats - a.stats);
            }
            const allStats = [...myStatArray, ...oppStatArray];
            allStats.sort((a, b) => b.stats - a.stats);
            const myFacActivity = await queryRetry("SELECT * FROM faction_activity WHERE id = ?", [myId]);
            let oppFacActivity;
            if(oppId)
                oppFacActivity = await queryRetry("SELECT * FROM faction_activity WHERE id = ?", [oppId]);
            let indivActivity;
            if(oppId)
                indivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ? OR facid = ?", [myId, oppId]);
            else
                indivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ?", [myId]);
            const indivActivityMap = new Map();
            for(const data of indivActivity)
                if(indivActivityMap.has(data.id)) {
                    const activity = indivActivityMap.get(data.id);
                    activity.sum += data.active;
                    activity.count++;
                }
                else
                    indivActivityMap.set(data.id, { "sum": data.active, "count": 1 });
            const percentiles = [];
            const intervalSize = allStats.length / 10;
            let i = 0;
            let myTotalActivitySum = 0, myTotalActivityCount = 0, oppTotalActivitySum = 0, oppTotalActivityCount;
            while(i < allStats.length) {
                i += intervalSize;
                let slice;
                if(i + intervalSize >= allStats.length) {
                    slice = allStats.slice(i - intervalSize);
                    i = allStats.length;
                }
                else
                    slice = allStats.slice(i - intervalSize, i);
                let myCount = 0, oppCount = 0, myActivitySum = 0, oppActivitySum = 0, myActivityCount = 0, oppActivityCount = 0;
                for(const stat of slice) {
                    if(!stat.opp)
                        myCount++;
                    else
                        oppCount++;
                    const activity = indivActivityMap.get(stat.id)
                    if(activity) {
                        if(!stat.opp) {
                            myActivitySum += activity.sum;
                            myActivityCount += activity.count;
                        }
                        else {
                            oppActivitySum += activity.sum;
                            oppActivityCount += activity.count;
                        }
                    }
                }
                percentiles.push({ "myCount": myCount, "oppCount": oppCount, "myActivity": myActivitySum / myActivityCount * 100, "oppActivity": oppActivitySum / oppActivityCount * 100, "max": slice[0].stats, "min": slice[slice.length - 1].stats });
            }
            const formatter = new Intl.NumberFormat("en-US", { notation: "compact" });
            const myName = myStats.faction.name;
            let oppName = null;
            if(oppId)
                oppName = oppStats.faction.name;
            let myMembers = 0, myStatSum = 0;
            myFacActivity.forEach(data => myMembers += data.numactive);
            myStatArray.forEach(stat => myStatSum += stat.stats);
            let myStatMedian = myStatArray[myStatArray.length / 2 + 1];
            if(myStatArray.length % 2 == 0)
                myStatMedian = Math.round((myStatArray[myStatArray.length / 2] + myStatArray[myStatArray.length / 2 + 1]) / 2);
            let content = `${myName}:\n${(myMembers / myFacActivity.length).toFixed(2)} average active members
                \nAverage battlestats: ${Math.round(myStatSum / myStatArray.length).toLocaleString()}
                \nMedian battlestats: ${myStatMedian.toLocaleString()}`;
            if(oppId) {
                let oppMembers = 0, oppStatSum = 0;
                oppFacActivity.forEach(data => oppMembers += data.numactive);
                oppStatArray.forEach(stat => oppStatSum += stat.stats);
                let oppStatMedian = oppStatArray[oppStatArray.length / 2 + 1];
                if(oppStatArray.length % 2 == 0)
                    oppStatMedian = Math.round((oppStatArray[oppStatArray.length / 2] + oppStatArray[oppStatArray.length / 2 + 1]) / 2);
                content += `${oppName}:\n${(oppMembers / oppFacActivity.length).toFixed(2)} average active members
                    \nAverage battlestats: ${Math.round(oppStatSum / oppStatArray.length).toLocaleString()}
                    \nMedian battlestats: ${oppStatMedian.toLocaleString()}`;
            }
            const statLineGraph = await makeStatLineGraph(myStatArray, oppStatArray, formatter, myName, oppName);
            const reply = {content: content, files: [{ attachment: statLineGraph, name: "statLineGraph.png" }]};
            if(oppId) {
                const statDistGraph = await makeStatDistGraph(percentiles, myName, oppName);
                reply.files.push({ attachemnt: statDistGraph, name: "statDistGraph.png" });
            }
            if(indivActivityMap.size > 0) {
                const activityLineGraph = await makeActivityLineGraph(myFacActivity, oppFacActivity, myName, oppName);
                const activityDistGraph = await makeActivityDistGraph(percentiles, formatter, myName, oppName);
                reply.files.push({ attachment: activityLineGraph, name: "activityLineGraph.png" }, { attachment: activityDistGraph, name: "activityDistGraph.png" });
            }
            return interaction.editReply(reply);
        }
        catch(e) {
            console.log(e);
            return interaction.editReply("Error:" + e);
        }
    },
};

async function makeStatLineGraph(myStatArray, oppStatArray, formatter, myName, oppName)
{
    const data = {
        datasets: [
        {
            label: myName,
            data: myStatArray.map((data, i) => ({ "x": i + 1, "y": data.stats })),
            borderColor: "rgb(255, 0, 0)",
            fill: false,
        }]
    }
    let xMax, yMin, yMax;
    if(oppStatArray.length > 0) {
        data.datasets.push({
            label: oppName,
            data: oppStatArray.map((data, i) => ({ "x": i + 1, "y": data.stats })),
            borderColor: "rgb(255, 0, 0)",
            fill: false,
        });
        xMax = Math.max(myStatArray.length, oppStatArray.length) + 0.5;
        yMin = Math.min(myStatArray[0].stats, oppStatArray[0].stats) * 0.9;
        yMax = Math.max(myStatArray[myStatArray.length - 1].stats, oppStatArray[oppStatArray.length - 1].stats) * 1.1;
    }
    else {
        xMax = myStatArray.length;
        yMin = myStatArray[0].stats * 0.9;
        yMax = myStatArray[myStatArray.length - 1].stats * 1.1;
    }
    const statLineChart = new QuickChart().setVersion("3")
    .setConfig({
        type: 'line',
        data: data,
        options: {
            scales: {
                x: {
                    type: "linear",
                    min: 0.5,
                    max: xMax,
                    title: {
                        display: true,
                        text: "Rank in faction"
                    },
                },
                y: {
                    type: "logarithmic",
                    min: yMin,
                    max: yMax,
                    title: {
                        display: true,
                        text: "Total battlestats"
                    },
                    ticks: {
                        callback: function(value) {
                            const leading = value.toString().replaceAll("0", "");
                            if(leading == "1" || leading == "2" || leading == "5")
                                return (new Intl.NumberFormat("en-US", {notation: "compact"})).format(value);
                            return null;
                        }
                    }
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await statLineChart.toBinary();
}
async function makeStatDistGraph(percentiles, myName, oppName)
{
    const statDistChart = new QuickChart().setVersion("3")
    .setConfig({
        type: "bar",
        data: {
            labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
            datasets: [{
                label: myName,
                data: percentiles.map(slice => slice.myCount),
                backgroundColor: "rgb(255, 0, 0)",
            }, {
                label: oppName,
                data: percentiles.map(slice => slice.oppCount),
                backgroundColor: "rgb(0, 0, 255)"
            }]
        },
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
                },
                plugins: {
                    datalabels: {
                        anchor: "end",
                        align: "top",
                        formatter: (value) => value,
                    }
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await statDistChart.toBinary();
}
async function makeActivityLineGraph(myFacActivity, oppFacActivity, myName, oppName) {
    const data = {
        datasets: [{
            label: myName,
            data: myFacActivity.map(data =>({ "x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive })),
            borderColor: "rgb(255,0,0)",
            fill: false
        }]
    };
    if(oppFacActivity.length > 0) {
        data.datasets.push({
            label: oppName,
            data: oppFacActivity.map(data => ({ "x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive })),
            borderColor: "rgb(0, 0, 255)",
            fill: false
        })
    }
    const activityLineChart = new QuickChart().setVersion("3")
    .setConfig({
        type: "line",
        data: data,
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        displayFormats: {
                            millisecond: "M/d HH:mm"
                        }
                    },
                    title: {
                        display: true,
                        text: "Time"
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: "Members active"
                    }
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await activityLineChart.toBinary();
}
async function makeActivityDistGraph(percentiles, formatter, myName, oppName) {
    const data = {
        labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
        datasets: [{
            label: myName,
            data: percentiles.map(slice => slice.myActivity),
            backgroundColor: "rgb(255, 0, 0)",
        }]
    };
    if(oppName) {
        data.datasets.push({
            label: oppName,
            data: percentiles.map(slice => slice.oppActivity),
            backgroundColor: "rgb(0, 0, 255)"
        });
    }
    const activityDistChart = new QuickChart().setVersion("3")
    .setConfig({
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
            },
        }
    }).setWidth(800).setHeight(600);
    return await activityDistChart.toBinary();
}