const { SlashCommandBuilder } = require('discord.js');
const { AsciiTable3 } = require("ascii-table3");
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
            const myStatMap = new Map();
            const missingStats = [];
            for(const [id, member] of Object.entries(myStats.faction.members))
                if(member.status.state !== "Fallen")
                    if("spy" in member) {
                        myStatMap.set(Number(id), member.spy.total);
                        if(Math.floor(Date.now() / 1000) - member.spy.timestamp > 604800)
                            missingStats.push(id);
                    }
                    else
                        missingStats.push(id);
            const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${[...missingStats].join()}`);
            for(const stat of ffscouterStats)
                if(!myStatMap.has(stat.player_id) || stat.bs_estimate > myStatMap.get(stat.player_id))
                    myStatMap.set(stat.player_id, stat.bs_estimate);
            const myStatArray = [...myStatMap].map(([key, value]) => ({"id": key, "stats": value, "opp": false}));
            myStatArray.sort((a, b) => b.stats - a.stats);
            missingStats.length = 0;
            let oppStats, oppStatArray = [];
            if(oppId) {
                oppStats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${oppId}`);
                if(!oppStats || !oppStats.status)
                    return interaction.editReply(`No faction ${oppId} found`);
                const oppStatMap = new Map();
                for(const [id, member] of Object.entries(oppStats.faction.members))
                    if(member.status.state !== "Fallen")
                        if("spy" in member) {
                            oppStatMap.set(Number(id), member.spy.total);
                            if(Math.floor(Date.now() / 1000) - member.spy.timestamp > 604800)
                                missingStats.push(id);
                        }
                        else
                            missingStats.push(id);
                const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingStats.join()}`);
                for(const stat of ffscouterStats)
                    if(!oppStatMap.has(stat.player_id) || stat.bs_estimate > oppStatMap.get(stat.player_id))
                        oppStatMap.set(stat.player_id, stat.bs_estimate);
                oppStatArray = [...oppStatMap].map(([key, value]) => ({"id": key, "stats": value, "opp": true}));
                oppStatArray.sort((a, b) => b.stats - a.stats);
            }
            const allStats = [...myStatArray, ...oppStatArray];
            allStats.sort((a, b) => b.stats - a.stats);
            const myFacActivity = await queryRetry("SELECT * FROM faction_activity WHERE id = ?", [myId]);
            let oppFacActivity;
            if(oppId)
                oppFacActivity = await queryRetry("SELECT * FROM faction_activity WHERE id = ?", [oppId]);
            const myIndivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ?", [myId]);
            let indivActivity = myIndivActivity;
            let oppIndivActivity = [];
            if(oppId) {
                oppIndivActivity = await queryRetry("SELECT * FROM individual_activity WHERE facid = ?", [oppId]);
                indivActivity = indivActivity.concat(oppIndivActivity);
            }
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
            const intervalSize = Math.floor(allStats.length / 10);
            for(let i = 0; i < 10; i++) {
                let slice;
                if(i === 9)
                    slice = allStats.slice(i * intervalSize);
                else
                    slice = allStats.slice(i * intervalSize, (i + 1) * intervalSize);
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
            const myName = myStats.faction.name + " (" + myId + ")";
            const table = new AsciiTable3("FACTION COMPARISON").setStyle("unicode-single").setHeading("STAT", myStats.faction.name.toUpperCase()).setAlignRight(2).setAlignRight(3);
            let oppName = null;
            if(oppId) {
                oppName = oppStats.faction.name + " (" + oppId + ")";
                table.setHeading("STAT", myStats.faction.name.toUpperCase(), oppStats.faction.name.toUpperCase());
            }
            let myStatSum = 0;
            myStatArray.forEach(stat => myStatSum += stat.stats);
            let myStatMedian = myStatArray[Math.floor(myStatArray.length / 2)].stats;
            if(myStatArray.length % 2 == 0)
                myStatMedian = Math.round((myStatArray[Math.floor(myStatArray.length / 2) - 1].stats + myStatArray[Math.floor(myStatArray.length / 2)].stats) / 2);
            let rowMatrix = [
                ["Id", myId],
                ["Average bs", Math.round(myStatSum / myStatArray.length).toLocaleString()],
                ["Median bs", myStatMedian.toLocaleString()],
            ];
            if(oppId) {
                let oppStatSum = 0;
                oppStatArray.forEach(stat => oppStatSum += stat.stats);
                let oppStatMedian = oppStatArray[Math.floor(oppStatArray.length / 2)].stats;
                if(oppStatArray.length % 2 == 0)
                    oppStatMedian = Math.round((oppStatArray[oppStatArray.length / 2 - 1].stats + oppStatArray[oppStatArray.length / 2].stats) / 2);
                rowMatrix = [
                    ["Id", myId, oppId],
                    ["Average bs", Math.round(myStatSum / myStatArray.length).toLocaleString(), Math.round(oppStatSum / oppStatArray.length).toLocaleString()],
                    ["Median bs", myStatMedian.toLocaleString(), oppStatMedian.toLocaleString()],
                ];
            }
            const statLineGraph = await makeStatLineGraph(myStatArray, oppStatArray, formatter, myName, oppName);
            const reply = {files: [{ attachment: statLineGraph, name: "statLineGraph.png" }]};
            const statDistGraph = await makeStatDistGraph(percentiles, myName, oppName, formatter);
            reply.files.push({ attachment: statDistGraph, name: "statDistGraph.png" });
            if(myIndivActivity.length > 0 && (!oppId || oppIndivActivity.length > 0)) {
                const activityLineGraph = await makeActivityLineGraph(myFacActivity, oppFacActivity, myName, oppName);
                const activityDistGraph = await makeActivityDistGraph(percentiles, formatter, myName, oppName);
                const activityHeatmap = await makeActivityHeatmap(myFacActivity, oppFacActivity, myName, oppName);
                let myMembers = 0;
                myFacActivity.forEach(data => myMembers += data.numactive);
                let activityMatrix = ["Average activity", (myMembers / myFacActivity.length).toFixed(2) + " members"];
                if(oppId) {
                    let oppMembers = 0;
                    oppFacActivity.forEach(data => oppMembers += data.numactive);
                    activityMatrix = ["Average activity", (myMembers / myFacActivity.length).toFixed(2) + " members", (oppMembers / oppFacActivity.length).toFixed(2) + " members"];
                }
                rowMatrix.push(activityMatrix);
                reply.files.push({ attachment: activityLineGraph, name: "activityLineGraph.png" }, { attachment: activityDistGraph, name: "activityDistGraph.png" }, {attachment: activityHeatmap, name: "activityHeatmap.png"});
            }
            table.addRowMatrix(rowMatrix);
            reply.content = "```\n" + table.toString() + "\n```";
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
            borderColor: "rgb(0, 0, 255)",
            fill: false,
        });
        xMax = Math.max(myStatArray.length, oppStatArray.length) + 0.5;
        yMin = Math.min(myStatArray[myStatArray.length - 1].stats, oppStatArray[oppStatArray.length - 1].stats) * 0.9;
        yMax = Math.max(myStatArray[0].stats, oppStatArray[0].stats) * 1.1;
    }
    else {
        xMax = myStatArray.length + 0.5;
        yMin = myStatArray[myStatArray.length - 1].stats * 0.9;
        yMax = myStatArray[0].stats * 1.1;
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
            },
            plugins: {
                title: {
                    display: true,
                    text: "Stat Line Graph"
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await statLineChart.toBinary();
}
async function makeStatDistGraph(percentiles, myName, oppName, formatter)
{
    let max = 0;
    percentiles.forEach(slice => {
        if(slice.myCount > max)
            max = slice.myCount;
        if(oppName && slice.oppCount > max)
            max = slice.oppCount;
    });
    max = Math.ceil(max / 5 + 1) * 5;
    const data = {
        labels: percentiles.map(slice => formatter.format(slice.max) + "-" + formatter.format(slice.min)),
        datasets: [{
            label: myName,
            data: percentiles.map(slice => slice.myCount),
            backgroundColor: "rgb(255, 0, 0)",
        }]
    };
    if(oppName)
        data.datasets.push({
            label: oppName,
            data: percentiles.map(slice => slice.oppCount),
            backgroundColor: "rgb(0, 0, 255)"
        });
    const statDistChart = new QuickChart().setVersion("3")
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
                        text: "Number of members"
                    },
                    max: max,
                },
            },
            plugins: {
                datalabels: {
                    anchor: "end",
                    align: "top",
                    formatter: (value) => value,
                },
                title: {
                    display: true,
                    text: "Stat Distribution Graph"
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
    if(oppFacActivity) {
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
            },
            plugins: {
                title: {
                    display: true,
                    text: "Activity Line Graph"
                },
                legend: {
                    labels: {
                        lineWidth: 0,
                    }
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await activityLineChart.toBinary();
}
async function makeActivityDistGraph(percentiles, formatter, myName, oppName) {
    let max = 0;
    percentiles.forEach(slice => {
        if(slice.myActivity > max)
            max = slice.myActivity;
        if(oppName && slice.oppActivity > max)
            max = slice.oppActivity;
    });
    max = Math.ceil(max / 10 + 1) * 10;
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
                    max: max,
                    ticks: {
                        callback: function(value) {
                            return value + "%";
                        }
                    }
                }
            },
            plugins: {
                datalabels: {
                    anchor: "end",
                    align: "top",
                    formatter: (value) => value.toFixed(1),
                },
                title: {
                    display: true,
                    text: "Activity Distribution Graph"
                }
            }
        }
    }).setWidth(800).setHeight(600);
    return await activityDistChart.toBinary();
}
async function makeActivityHeatmap(myFacActivity, oppFacActivity, myName, oppName)
{
    const myActivityPerDay = Array.from({ length: 7 }, () => Array(24).fill(null));
    let activityPerDay = Array.from({ length: 7 }, () => Array(24).fill(null));
    let max = 0, min = 0;
    for(const data of myFacActivity) {
        const date = new Date(data.timestamp);
        let day = date.getDay();
        let hour = date.getHours();
        if(date.getMinutes() > 30)
            hour++;
        if(hour > 23) {
            day++;
            if(day > 6)
                day = 0;
            hour = 0;
        }
        myActivityPerDay[day][hour] = data.numactive;
        if(data.numactive > max)
            max = data.numactive;
        if(data.numactive < min)
            min = data.numactive;
    }
    if(oppName) {
        const oppActivityPerDay = Array.from({ length: 7 }, () => Array(24).fill(null));
        for(const data of oppFacActivity) {
            const date = new Date(data.timestamp);
            let day = date.getDay();
            let hour = date.getHours();
            if(date.getMinutes() > 30)
                hour++;
            if(hour > 23) {
                day++;
                if(day > 6)
                    day = 0;
                hour = 0;
            }
            oppActivityPerDay[day][hour] = data.numactive;
        }
        max = 0, min = 0;
        for(let r = 0; r < 7; r++)
            for(let c = 0; c < 24; c++)
                if(oppActivityPerDay[r][c] !== null && myActivityPerDay[r][c] !== null) {
                    activityPerDay[r][c] = myActivityPerDay[r][c] - oppActivityPerDay[r][c];
                    if(activityPerDay[r][c] > max)
                        max = activityPerDay[r][c];
                    if(activityPerDay[r][c] < min)
                        min = activityPerDay[r][c];
                }
    }
    else
        activityPerDay = myActivityPerDay;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const data = {
        labels: [...Array(24).keys()],
        datasets: []
    }
    for(let i = 0; i < 7; i++)
        data.datasets.push({
            data: Array(24).fill(1),
            backgroundColor: await generateColors(activityPerDay[i], min, max),
            dataLabels: activityPerDay[i],
        });
    const activityHeatmapChart = new QuickChart().setVersion("3")
    .setConfig({
        type: "bar",
        data: data,
        options: {
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: "Hour"
                    },
                    categoryPercentage: 1.0,
                    barPercentage: 1.0,
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: "Day"
                    },
                    ticks: {
                        stepSize: 0.5,
                        callback: function(value) {
                            switch(value) {
                                case 0.5: return "Sunday";
                                case 1.5: return "Monday";
                                case 2.5: return "Tuesday";
                                case 3.5: return "Wednesday";
                                case 4.5: return "Thursday";
                                case 5.5: return "Friday";
                                case 6.5: return "Saturday";
                                default: return null;
                            }

                        }
                    },
                }
            },
            plugins: {
                datalabels: {
                    formatter: function(value, context) {
                        return context.chart.data.datasets[context.datasetIndex].dataLabels[context.dataIndex];
                    },
                    color: "rgb(255, 255, 255)"
                },
                title: {
                    display: true,
                    text: "Activity Heatmap"
                },
                legend: {
                    labels: { //need to stringify generateLabels like this to reference outside variables
                        generateLabels: new Function('chart', `
                            return [{
                                text: ${JSON.stringify(myName)},
                                fillStyle: "rgb(255, 0, 0)",
                                lineWidth: 0,
                            }, {
                                text: ${JSON.stringify(oppName)},
                                fillStyle: "rgb(0, 0, 255)",
                                lineWidth: 0,
                            }]
                        `)
                    }
                },
            }
        }
    }).setWidth(800).setHeight(600);
    return await activityHeatmapChart.toBinary();
}
async function generateColors(facActivity, min, max)
{
    try {
        const colors = new Array(24).fill("rgb(255, 255, 255)");
        for(const i in facActivity) {
            const data = facActivity[i];
            if(data === null) continue;
            if(data > 0)
                colors[i] = `rgb(${Math.round(255 * data / max)}, 0, 0)`;
            else if(data < 0)
                colors[i] = `rgb(0, 0, ${Math.round(255 * data / min)})`;
            else
                colors[i] = `rgb(0, 0, 0)`;
        }
        return colors;
    }
    catch(e) {
        console.log(e);
        return [];
    }
}