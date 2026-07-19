const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const queryRetry = require('../../queryRetry.js');

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
            const chart = new QuickChart().setVersion("3");
            chart.setConfig({
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