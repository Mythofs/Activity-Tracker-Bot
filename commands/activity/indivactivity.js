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
            let data, content;
            if(oppid) {
                const [oppActivityData] = await db.execute("SELECT name, timestamp, active FROM faction_activity WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.editReply(`No faction ${oppid} found`);
                const name = activityData[0].name;
                const oppname = oppActivityData[0].name;
                data = {
                    datasets: [
                    {
                        label: name,
                        data: activityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    },
                    {
                        label: oppname,
                        data: oppActivityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(0,0,255)",
                        fill: false
                    }]
                }
                let sum = 0;
                activityData.forEach(data => sum += data.active);
                let oppsum = 0;
                oppActivityData.forEach(data => sum += data.active);
                content = `${name} active ${(sum / activityData.length * 100).toFixed(2)}% of the time
                    \n${oppname} active ${(oppsum / oppActivityData.length * 100).toFixed(2)}% of the time`;
            }
            else {
                data = {
                    datasets: [
                    {
                        label: activityData[0].name,
                        data: activityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(255, 0, 0)",
                        fill: false
                    }]
                }
                let sum = 0;
                activityData.forEach(data => sum += data.active);
                content = `${name} active ${(sum / activityData.length * 100).toFixed(2)}% of the time`;
            }
            const chart = new QuickChart().setVersion("3");
            chart.setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        x: {
                            type: "time",
                            title: {
                                display: true,
                                text: "Time"
                            }
                        },
                        y: {
                            min: 0,
                            max: 1,
                            title: {
                                display: true,
                                text: "Active"
                            }
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