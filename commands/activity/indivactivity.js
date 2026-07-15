const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const db = require("../../db.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('indivactivity').setDescription('Provides activity for specified player(s)')
        .addIntegerOption((option) => option.setName("id").setDescription("The player id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The player id to compare")),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid");
            const [activityData] = await db.execute("SELECT name, timestamp, active FROM individual_activity WHERE id = ?", [id]);
            if(activityData.length == 0)
                return await interaction.editReply(`No player ${id} found`);
            const chart = new QuickChart();
            let data;
            if(oppid) {
                const [oppActivityData] = await db.execute("SELECT name, timestamp, active FROM individual_activity WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.editReply(`No player ${oppid} found`);
                let labels, dataPoints, oppDataPoints;
                if(activityData.length > oppActivityData) {
                    labels = oppActivityData.map(data => new Date(data.timestamp).toLocaleString());
                    if(labels.length > 250)
                        labels = labels.slice(-250);
                    oppDataPoints = oppActivityData.map(data => data.active).slice(-1 * labels.length);
                    let index = -1;
                    for(let i = activityData.length - oppDataPoints.length; i >= 0; i--)
                        if(Math.abs(activityData[i].timestamp % 86400 - labels[0] % 86400) < 300) {
                            index = i;
                            break;
                        }
                    if(index = -1)
                        return await interaction.reply(`Not enough data points to make comparison`);
                    dataPoints = activityData.slice(-1 * oppDataPoints.length);
                }
                else {
                    labels = activityData.map(data => new Date(data.timestamp).toLocaleString());
                    if(labels.length > 250)
                        labels = labels.slice(-250);
                    dataPoints = activityData.map(data => data.active).slice(-1 * labels.length);
                    let index = -1;
                    for(let i = oppActivityData.length - dataPoints.length; i >= 0; i--)
                        if(Math.abs(oppActivityData[i].timestamp % 86400 - labels[0] % 86400) < 300) {
                            index = i;
                            break;
                        }
                    if(index = -1)
                        return await interaction.reply(`Not enough data points to make comparison`);
                    oppDataPoints = oppActivityData.slice(-1 * dataPoints.length);
                }
                data = {
                    labels: labels,
                    datasets: [
                    {
                        label: dataPoints[0].name,
                        data: dataPoints,
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    },
                    {
                        label: oppDataPoints[0].name,
                        data: oppDataPoints,
                        borderColor: "rgb(0,0,255)",
                        fill: false
                    }]
                }
            }
            else {
                let adjustedActivityData = activityData;
                if(adjustedActivityData.length > 250)
                    adjustedActivityData = adjustedActivityData.slice(-250);
                const data = {
                    labels: adjustedActivityData.map(data => new Date(data.timestamp).toLocaleString()),
                    datasets: [
                    {
                        label: adjustedActivityData[0].name,
                        data: adjustedActivityData.map(data => data.active),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    }]
                }
            }
            chart.setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        yAxes: [{
                          ticks: {
                            min: 0,
                            max: 1
                          }
                        }]
                    }
                }
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const buffer = await chart.toBinary();
            return interaction.editReply({files: [{attachment: buffer, name: "activityGraph.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(`Error while sending activity graph ${e}`);
        }
    },
};