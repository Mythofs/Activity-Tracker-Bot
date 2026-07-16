const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const db = require('../../db.js');

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
            const chart = new QuickChart();
            let [activityData] = await db.execute("SELECT name, timestamp, numactive FROM faction_activity WHERE id = ?", [id]);
            if(activityData.length == 0)
                return await interaction.editReply(`No faction ${id} found`);
            let data, content;
            if(oppid) {
                let [oppActivityData] = await db.execute("SELECT name, timestamp, numactive FROM faction_activity WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.editReply(`No faction ${oppid} found`);
                let labels, dataPoints, oppDataPoints;
                if(activityData.length > oppActivityData.length) {
                    if(oppActivityData.length > 250)
                        oppActivityData = oppActivityData.slice(-250);
                    labels = oppActivityData.map(data => new Date(data.timestamp).toLocaleString());
                    oppDataPoints = oppActivityData.map(data => data.numactive);
                    let index = -1;
                    for(let i = activityData.length - oppDataPoints.length; i >= 0; i--)
                        if(Math.abs(activityData[i].timestamp % 86400000 - oppActivityData[0] % 86400000) < 300000) {
                            index = i;
                            break;
                        }
                    if(index == -1)
                        return await interaction.editReply(`Not enough data points to make comparison`);
                    dataPoints = activityData.map(data => data.numactive).slice(index, index + oppActivityData.length);
                }
                else {
                    if(activityData.length > 250)
                        activityData = oppActivityData.slice(-250);
                    labels = activityData.map(data => new Date(data.timestamp).toLocaleString());
                    dataPoints = activityData.map(data => data.numactive);
                    let index = -1;
                    for(let i = oppActivityData.length - activityData.length; i >= 0; i--)
                        if(Math.abs(oppActivityData[i].timestamp % 86400000 - activityData[0].timestamp % 86400000) < 300000) {
                            index = i;
                            break;
                        }
                    if(index == -1)
                        return await interaction.editReply(`Not enough data points to make comparison`);
                    oppDataPoints = oppActivityData.map(data => data.numactive).slice(index, index + activityData.length);
                }
                const name = activityData[0].name;
                const oppname = oppActivityData[0].name;
                data = {
                    labels: labels,
                    datasets: [
                    {
                        label: name,
                        data: dataPoints,
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    },
                    {
                        label: oppname,
                        data: oppDataPoints,
                        borderColor: "rgb(0,0,255)",
                        fill: false
                    }]
                }
                let sum = 0, oppsum = 0, count = 0, oppcount = 0;
                for(const i in activityData) {
                    sum += activityData[i].numactive;
                    oppsum += oppActivityData[i].numactive;
                    if(activityData[i].numactive > oppActivityData[i].numactive)
                        count++;
                    else if(activityData[i].numactive < oppActivityData[i].numactive)
                        oppcount++;
                }
                content = `${name}: ${(sum / dataPoints.length).toFixed(2)} average active members
                    \n${oppname}: ${(oppsum / oppDataPoints.length).toFixed(2)} average active members
                    \n${name}: ahead ${(count / dataPoints.length * 100).toFixed(2)}% of the time
                    \n${oppname}: ahead ${(oppcount / oppDataPoints.length * 100).toFixed(2)}% of the time
                    \nEqual activity ${((dataPoints.length - count - oppcount) / dataPoints.length * 100).toFixed(2)}% of the time`;
            }
            else {
                if(activityData.length > 250)
                    activityData = activityData.slice(-250);
                data = {
                    labels: activityData.map(data => new Date(data.timestamp).toLocaleString()),
                    datasets: [
                    {
                        label: activityData[0].name,
                        data: activityData.map(data => data.numactive),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    }]
                }
                let sum = 0;
                for(const data of activityData)
                    sum += data.numactive;
                content = `${activityData[0].name}: ${(sum / activityData.length).toFixed(2)} average active memebers`;
            }
            chart.setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        yAxes: [{
                          ticks: {
                            min: 0,
                            max: 100
                          }
                        }]
                    }
                }
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const buffer = await chart.toBinary();
            return interaction.editReply({content: content, files: [{attachment: buffer, name: "activityGraph.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(`Error while sending activity graph ${e}`);
        }
    },
};