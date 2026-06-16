const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const monitorStore = require('../../monitorStore');

module.exports = {
    data: new SlashCommandBuilder().setName('monitor').setDescription("Monitors a faction's activity for a day")
        .addStringOption((option) => option.setName('id').setDescription('The faction to monitor').setRequired(true)),
    async execute(interaction) {
        const facId = interaction.options.getString('id', true);
        if(monitorStore.size > 0 && monitorStore.has(facId))
            return;
        else
            monitorStore.clear();
    }
}