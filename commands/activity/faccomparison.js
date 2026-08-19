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
            const myStats = await getStats(myId, false);
            if(myStats === null)
                return await interaction.editReply("Error fetching stats for " + myId);
            const myStatArray = myStats[1];
            const myName = myStats[0];
            oppStatArray = [], oppName = null;
            if(oppId) {
                oppStats = await getStats(oppId, true);
                if(oppStats === null)
                    return await interaction.editReply("Error fetching stats for " + oppId);
                oppStatArray = oppStats[1];
                oppName = oppStats[0]
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
            const table = new AsciiTable3("FACTION COMPARISON").setStyle("unicode-single").setHeading("STAT", myName.toUpperCase()).setAlignRight(2).setAlignRight(3);
            if(oppId)
                table.setHeading("STAT", myName.toUpperCase(), oppName.toUpperCase());
            let myStatSum = 0;
            myStatArray.forEach(stat => myStatSum += stat.stats);
            let myStatMedian = myStatArray[Math.floor(myStatArray.length / 2)].stats;
            if(myStatArray.length % 2 == 0)
                myStatMedian = Math.round((myStatArray[Math.floor(myStatArray.length / 2) - 1].stats + myStatArray[Math.floor(myStatArray.length / 2)].stats) / 2);
            let rowMatrix = [
                ["Id", myId],
                ["Members", myStatArray.length],
                ["Avg bs", `${Math.round(myStatSum / myStatArray.length).toLocaleString()} (${formatter.format(Math.round(myStatSum / myStatArray.length))})`],
                ["Median bs", `${myStatMedian.toLocaleString()} (${formatter.format(myStatMedian)})`],
            ];
            if(oppId) {
                let oppStatSum = 0;
                oppStatArray.forEach(stat => oppStatSum += stat.stats);
                let oppStatMedian = oppStatArray[Math.floor(oppStatArray.length / 2)].stats;
                if(oppStatArray.length % 2 == 0)
                    oppStatMedian = Math.round((oppStatArray[oppStatArray.length / 2 - 1].stats + oppStatArray[oppStatArray.length / 2].stats) / 2);
                rowMatrix = [
                    ["Id", myId, oppId],
                    ["Members", myStatArray.length, oppStatArray.length],
                    ["Avg bs", `${Math.round(myStatSum / myStatArray.length).toLocaleString()} (${formatter.format(Math.round(myStatSum / myStatArray.length))})`, `${Math.round(oppStatSum / oppStatArray.length).toLocaleString()} (${formatter.format(Math.round(oppStatSum / oppStatArray.length))})`],
                    ["Median bs", `${myStatMedian.toLocaleString()} (${formatter.format(myStatMedian)})`, `${oppStatMedian.toLocaleString()} (${formatter.format(oppStatMedian)})`],
                ];
            }
            const statLineGraph = await makeStatLineGraph(myStatArray, oppStatArray, formatter, myName, oppName, myId, oppId);
            const reply = {files: [{ attachment: statLineGraph, name: "statLineGraph.png" }]};
            const statDistGraph = await makeStatDistGraph(percentiles, myName, oppName, myId, oppId, formatter);
            reply.files.push({ attachment: statDistGraph, name: "statDistGraph.png" });
            if(myIndivActivity.length > 0 && (!oppId || oppIndivActivity.length > 0)) {
                const activityLineGraph = await makeActivityLineGraph(myFacActivity, oppFacActivity, myName, oppName, myId, oppId);
                const activityDistGraph = await makeActivityDistGraph(percentiles, formatter, myName, oppName, myId, oppId);
                const heatmapData = await makeActivityHeatmap(myFacActivity, oppFacActivity, myName, oppName, myId, oppId);
                const activityHeatmap = heatmapData.graph;
                let myMembers = 0;
                myFacActivity.forEach(data => myMembers += data.numactive);
                let activityMatrix = ["Avg activity", (myMembers / myFacActivity.length).toFixed(2) + " members"];
                let percentMatrix = ["Percent ahead", (heatmapData.count[1] / heatmapData.count[0] * 100).toFixed(2) + "%"];
                let countMatrix = ["Data points", myFacActivity.length + " points"];
                if(oppId) {
                    let oppMembers = 0;
                    oppFacActivity.forEach(data => oppMembers += data.numactive);
                    activityMatrix = ["Avg activity", (myMembers / myFacActivity.length).toFixed(2) + " members", (oppMembers / oppFacActivity.length).toFixed(2) + " members"];
                    percentMatrix = ["Percent ahead", (heatmapData.count[1] / heatmapData.count[0] * 100).toFixed(2) + "%", (heatmapData.count[2] / heatmapData.count[0] * 100).toFixed(2) + "%"];
                    countMatrix = ["Data points", myFacActivity.length + " points", + oppFacActivity.length + " points"];
                }
                rowMatrix.push(activityMatrix);
                rowMatrix.push(percentMatrix);
                rowMatrix.push(countMatrix);
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
async function getStats(facId, opp)
{
    try {
        const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/faction/${facId}`);
        if(!stats || !stats.status)
            return null;
        const statMap = new Map();
        const missingStats = [];
        for(const [id, member] of Object.entries(stats.faction.members))
            if(member.status.state !== "Fallen")
                if("spy" in member) {
                    statMap.set(Number(id), { "total": member.spy.total, "timestamp": member.spy.timestamp });
                    if(Math.floor(Date.now() / 1000) - member.spy.timestamp > 604800)
                        missingStats.push(id);
                }
                else
                    missingStats.push(id);
        const ffscouterStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${missingStats.join()}`);
        for(const stat of ffscouterStats)
            if(!statMap.has(stat.player_id) || (stat.bs_estimate > statMap.get(stat.player_id).total && stat.last_updated > statMap.get(stat.player_id).timestamp))
                statMap.set(stat.player_id, { "total": stat.bs_estimate });
        const statArray = [...statMap].map(([key, value]) => ({"id": key, "stats": value.total, "opp": opp}));
        statArray.sort((a, b) => b.stats - a.stats);
        return [stats.faction.name, statArray];
    }
    catch(e) {
        console.log(e);
        return null;
    }
}
async function makeStatLineGraph(myStatArray, oppStatArray, formatter, myName, oppName, myId, oppId)
{
    const data = {
        datasets: [
        {
            label: myName + " (" + myId + ")",
            data: myStatArray.map((data, i) => ({ "x": i + 1, "y": data.stats })),
            borderColor: "rgb(255, 100, 100)",
            backgroundColor: "rgb(255, 100, 100)",
            fill: false,
        }]
    }
    let xMax, yMin, yMax;
    if(oppStatArray.length > 0) {
        data.datasets.push({
            label: oppName + " (" + oppId + ")",
            data: oppStatArray.map((data, i) => ({ "x": i + 1, "y": data.stats })),
            borderColor: "rgb(100, 100, 255)",
            backgroundColor: "rgb(100, 100, 255)",
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
                        text: "Rank in faction",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    },
                },
                y: {
                    type: "logarithmic",
                    min: yMin,
                    max: yMax,
                    title: {
                        display: true,
                        text: "Total battlestats",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        callback: function(value) {
                            const leading = value.toString().replaceAll("0", "");
                            if(leading == "1" || leading == "2" || leading == "5")
                                return (new Intl.NumberFormat("en-US", {notation: "compact"})).format(value);
                            return null;
                        },
                        color: "rgb(224, 224, 224)",
                    },
                    grid: {
                        color: "rgb(63, 63, 63)",
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: "Stat Line Graph",
                    color: "rgb(224, 224, 224)",
                },
                legend: {
                    labels: {
                        color: "rgb(224, 224, 224)",
                    },
                },
            }
        }
    }).setWidth(800).setHeight(600).setBackgroundColor("rgb(18, 18, 18)");
    return await statLineChart.toBinary();
}
async function makeStatDistGraph(percentiles, myName, oppName, myId, oppId, formatter)
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
            label: myName + " (" + myId + ")",
            data: percentiles.map(slice => slice.myCount),
            backgroundColor: "rgb(255, 100, 100)",
        }]
    };
    if(oppName)
        data.datasets.push({
            label: oppName + " (" + oppId + ")",
            data: percentiles.map(slice => slice.oppCount),
            backgroundColor: "rgb(100, 100, 255)"
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
                        text: "Stat Percentiles",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Number of members",
                        color: "rgb(224, 224, 224)",
                    },
                    max: max,
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    },
                },
            },
            plugins: {
                datalabels: {
                    anchor: "end",
                    align: "top",
                    formatter: (value) => value,
                    color: "rgb(224, 224, 224)",
                },
                title: {
                    display: true,
                    text: "Stat Distribution Graph",
                    color: "rgb(224, 224, 224)",
                },
                legend: {
                    labels: {
                        color: "rgb(224, 224, 224)",
                    },
                },
            }
        }
    }).setWidth(800).setHeight(600).setBackgroundColor("rgb(18, 18, 18)");
    return await statDistChart.toBinary();
}
async function makeActivityLineGraph(myFacActivity, oppFacActivity, myName, oppName, myId, oppId) {
    const data = {
        datasets: [{
            label: myName + " (" + myId + ")",
            data: myFacActivity.map(data =>({ "x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive })),
            borderColor: "rgb(255, 100, 100)",
            backgroundColor: "rgb(255, 100, 100)",
            fill: false
        }]
    };
    if(oppFacActivity) {
        data.datasets.push({
            label: oppName + " (" + oppId + ")",
            data: oppFacActivity.map(data => ({ "x": Math.floor(data.timestamp / 1000) * 1000, "y": data.numactive })),
            borderColor: "rgb(100, 100, 255)",
            backgroundColor: "rgb(100, 100, 255)",
            color: "rgb(224, 224, 224)",
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
                        text: "Time",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: "Members active",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    },
                    grid: {
                        color: "rgb(63, 63, 63)",
                    },
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: "Activity Line Graph",
                    color: "rgb(224, 224, 224)",
                },
                legend: {
                    labels: {
                        color: "rgb(224, 224, 224)",
                    },
                },
            }
        }
    }).setWidth(800).setHeight(600).setBackgroundColor("rgb(18, 18, 18)");
    return await activityLineChart.toBinary();
}
async function makeActivityDistGraph(percentiles, formatter, myName, oppName, myId, oppId) {
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
            label: myName + " (" + myId + ")",
            data: percentiles.map(slice => slice.myActivity),
            backgroundColor: "rgb(255, 100, 100",
            color: "rgb(224, 224, 224)",
        }]
    };
    if(oppName) {
        data.datasets.push({
            label: oppName + " (" + oppId + ")",
            data: percentiles.map(slice => slice.oppActivity),
            backgroundColor: "rgb(100, 100, 255)",
            color: "rgb(224, 224, 224)",
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
                        text: "Stat Percentiles",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: "Average Activity",
                        color: "rgb(224, 224, 224)",
                    },
                    max: max,
                    ticks: {
                        callback: function(value) {
                            return value + "%";
                        },
                        color: "rgb(224, 224, 224)",
                    }
                }
            },
            plugins: {
                datalabels: {
                    anchor: "end",
                    align: "top",
                    formatter: (value) => value.toFixed(1),
                    color: "rgb(224, 224, 224)",
                },
                title: {
                    display: true,
                    text: "Activity Distribution Graph",
                    color: "rgb(224, 224, 224)",
                },
                legend: {
                    labels: {
                        color: "rgb(224, 224, 224)",
                    },
                },
            }
        }
    }).setWidth(800).setHeight(600).setBackgroundColor("rgb(18, 18, 18)");
    return await activityDistChart.toBinary();
}
async function makeActivityHeatmap(myFacActivity, oppFacActivity, myName, oppName, myId, oppId)
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
    let labelConfig = `return [{
        text: ${JSON.stringify(myName + " (" + myId + ")")},
        fillStyle: "rgb(255, 100, 100)",
        lineWidth: 0,
    }]`;
    if(oppName) {
        const oppActivityPerDay = Array.from({ length: 7 }, () => Array(24).fill(null));
        for(const data of oppFacActivity) {
            const date = new Date(data.timestamp);
            let day = date.getUTCDay();
            let hour = date.getUTCHours();
            if(date.getUTCMinutes() > 30)
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
        labelConfig = `return [{
            text: ${JSON.stringify(myName + " (" + myId + ")")},
            fillStyle: "rgb(255, 100, 100)",
            lineWidth: 0,
        }, {
            text: ${JSON.stringify(oppName + " (" + oppId + ")")},
            fillStyle: "rgb(100, 100, 255)",
            lineWidth: 0,
        }]`
    }
    else
        activityPerDay = myActivityPerDay;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const data = {
        labels: [...Array(24).keys()],
        datasets: []
    }
    let allCount = 0, myCount = 0, oppCount = 0;
    for(let i = 0; i < 7; i++) {
        const colorData = await generateColors(activityPerDay[i], min, max);
        data.datasets.push({
            data: Array(24).fill(1),
            backgroundColor: colorData.colors,
            dataLabels: activityPerDay[i],
        });
        allCount += colorData.count[0];
        myCount += colorData.count[1];
        oppCount += colorData.count[2];
    }
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
                        text: "Hour",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        color: "rgb(224, 224, 224)",
                    },
                    categoryPercentage: 1.0,
                    barPercentage: 1.0,
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: "Day",
                        color: "rgb(224, 224, 224)",
                    },
                    ticks: {
                        stepSize: 0.5,
                        color: "rgb(224, 224, 224)",
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
                    color: "rgb(224, 224, 224)",
                },
                title: {
                    color: "rgb(224, 224, 224)",
                    display: true,
                    text: "Activity Heatmap"
                },
                legend: {
                    labels: {
                        generateLabels: new Function('chart', `${labelConfig}`),
                    }
                },
            },
            color: "rgb(224, 224, 224)",
        }
    }).setWidth(800).setHeight(600).setBackgroundColor("rgb(18, 18, 18)");
    return { "graph": await activityHeatmapChart.toBinary(), "count": [allCount, myCount, oppCount] };
}
async function generateColors(facActivity, min, max)
{
    try {
        let allCount = 0, myCount = 0, oppCount = 0;
        const colors = new Array(24).fill("rgb(18, 18, 18)");
        for(const i in facActivity) {
            const data = facActivity[i];
            if(data === null) continue;
            allCount++;
            if(data > 0) {
                colors[i] = `rgb(${Math.round(255 * data / max)}, ${Math.round(100 * data / max)}, ${Math.round(100 * data / max)})`;
                myCount++;
            }
            else if(data < 0) {
                colors[i] = `rgb(${Math.round(100 * data / min)}, ${Math.round(100 * data / min)}, ${Math.round(255 * data / min)})`;
                oppCount++;
            }
        }
        return { "colors": colors, "count": [allCount, myCount, oppCount] };
    }
    catch(e) {
        console.log(e);
        return [];
    }
}