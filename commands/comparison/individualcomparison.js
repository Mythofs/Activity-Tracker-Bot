const { SlashCommandBuilder } = require('discord.js');
const individualActivityStore = require('../../individualActivityStore');
const individualName = require("../../individualName");
const { Chart } = require('chart.js/auto');
const { createCanvas } = require('canvas');
require('dotenv').config();

module.exports = { 
    data: new SlashCommandBuilder().setName('activitycomparison').setDescription('Provides activity compaison for specified players')
        .addStringOption((option) => option.setName("id").setDescription("The player to compare").setRequired(true))
        .addStringOption((option) => option.setName("oppid").setDescription("The player to compare").setRequired(false)),
    async execute(interaction) {
        try {
            console.log(factionActivityStore);
            let id = Number(interaction.options.getString("id", true)); //converts to 0 when null
            let oppId = Number(interaction.options.getString("oppid"));
            const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
            if(oppId == 0)
                oppId = process.env.PLAYER_ID;
            if(!individualActivityStore.has(id))
                return interaction.reply(`No player ${id} found`);
            if(!individualActivityStore.has(oppId))
                return interaction.reply(`No player ${id} found`);
            canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            const data = {
                labels: [...individualActivityStore.get(id).keys()].map(timestamp => new Date(timestamp).toLocaleString()),
                datasets: [
                {
                    label: individualName.get(id),
                    data: [...individualActivityStore.get(id).values()],
                    borderColor: 'rgb(255, 0, 0)'
                },
                {
                    label: individualName.get(oppId),
                    data: [...individualActivityStore.get(oppId).values()],
                    borderColor: 'rgb(0, 0, 255)'
                }]
            }
            new Chart(ctx, {
                type: 'line',
                data: data,
                options: {
                    scales: {
                        y: {
                            min: 0,
                            max: 1
                        }
                    }
                }
            });
            const buffer = canvas.toBuffer('image/png');
            return interaction.reply({files: [{attachment: buffer, name: 'activityGraph.png'}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            return interaction.reply(`Error while sending activity graph ${e}`);
        }
    },
};
async function safeFetch(url, channel) {
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        channel.send(`Error while fetching ${url}, ${error}`);
    }
    let data;
    try {
        data = await response.json();
    } catch(error) {
        channel.send(`Invalid JSON from ${url}, ${error}`);
    }
    if (!response.ok)
        channel.send(`Error from ${url}: ${JSON.stringify(data)}`);
    return data;
}