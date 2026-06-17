const { SlashCommandBuilder } = require('discord.js');
const factionActivityStore = require('../../factionActivityStore');
const { Chart } = require('chart.js/auto');
const { createCanvas } = require('canvas');
require('dotenv').config();

module.exports = { 
    data: new SlashCommandBuilder().setName('activitycomparison').setDescription('Provides activity compaison for current ranked war')
        .addStringOption((option) => option.setName("id").setDescription("The faction to compare").setRequired(false))
        .addStringOption((option) => option.setName("oppid").setDescription("The faction to compare").setRequired(false)),
    async execute(interaction) {
        try {
            console.log(factionActivityStore);
            let id = Number(interaction.options.getString("id")); //converts to 0 when null
            let oppId = Number(interaction.options.getString("oppid"));
            const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
            if(id == 0 && oppId == 0) {
                const warData = await safeFetch(`https://api.torn.com/v2/faction/wars?comment=Activity%20Tracker%20Bot&key=${process.env.API_KEY}`, channel);
                if(Array.isArray(warData.wars.ranked))
                    return interaction.reply("No ranked war found");
                oppId = warData.wars.ranked.factions.find(fac => fac.id != process.env.FAC_ID).id;
                id = Number(process.env.FAC_ID);
            }
            else if(id == 0)
                id = Number(process.env.FAC_ID);
            else if(oppId == 0)
                oppId = Number(process.env.FAC_ID);
            if(!factionActivityStore.has(id))
                return interaction.reply(`No faction ${id} found`);
            if(!factionActivityStore.has(oppId))
                return interaction.reply(`No faction ${id} found`);
            canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            const data = {
                labels: [...factionActivityStore.get(id).keys()].map(timestamp => new Date(timestamp).toLocaleString()),
                datasets: [
                {
                    label: id,
                    data: [...factionActivityStore.get(id).values()],
                    borderColor: 'rgb(255, 0, 0)'
                },
                {
                    label: oppId,
                    data: [...factionActivityStore.get(oppId).values()],
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
                            max: 100
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