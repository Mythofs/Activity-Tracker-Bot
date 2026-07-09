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
            const [activityData] = await db.execute("SELECT name, timestamp, numactive FROM faction_name WHERE id = ?", [id]);
            if(activityData.length == 0)
                return await interaction.reply(`No faction ${id} found`);
            const chart = new QuickChart();
            const data = {
                labels: activityData.map(data => new Date(data.timestamp).toLocaleString()),
                datasets: [
                {
                    label: activityData[0].name,
                    data: activityData.map(data => data.numactive),
                    borderColor: "rgb(255, 0, 0)",
                    fill: false
                }]
            }
            if(oppid != null) {
                const [oppActivityData] = await db.execute("SELECT name, timestamp, numactive FROM faction_name WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.reply(`No faction with ${oppid} found`);
                let index = 0;
                for(const i in oppActivityData)
                    if(Math.abs(oppActivityData[i].timestamp % 86400 - activityData[0].timestamp % 86400) < 300) {
                        index = i;
                        break;
                    }
                const adjustedOppData = [ ...oppActivityData.slice(index),...oppActivityData.slice(0, index)];
                data.datasets.push({
                    label: oppActivityData[0].name,
                    data: adjustedOppData.map(data => data.numactive),
                    borderColor: "rgb(0,0,255)",
                    fill: false
                })
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
            return interaction.editReply({files: [{attachment: buffer, name: "activityGraph.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(`Error while sending activity graph ${e}`);
        }
    },
};