const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const db = require("../../db.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('indivactivity').setDescription('Provides activity for specified player')
        .addStringOption((option) => option.setName("id").setDescription("Player id").setRequired(true)),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = Number(interaction.options.getString("id", true));
            const [name] = await db.execute('SELECT name FROM individual_name WHERE id = ?', [id]);
            if(name.length == 0)
                return interaction.reply(`No player ${id} found`);
            const chart = new QuickChart();
            const [labels] = await db.execute('SELECT timestamp FROM individual_activity WHERE id = ?', [id]);
            const [activityData] = await db.execute('SELECT active FROM individual_activity WHERE id = ?', [id]);
            const data = {
                labels: labels.map(label => new Date(label.timestamp).toLocaleString()),
                datasets: [
                {
                    label: name[0].name,
                    data: activityData.map(data => data.active),
                    borderColor: 'rgb(255, 0, 0)'
                }]
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
            return interaction.reply({files: [{attachment: buffer, name: 'activityGraph.png'}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            channel.send(`Error while sending activity graph ${e}`);
            return interaction.reply(`Error while sending activity graph ${e}`);
        }
    },
};