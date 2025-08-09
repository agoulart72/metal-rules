import { libWrapper } from "../lib/shim.js";

export const moduleName = "metal-rules";

export function register() {
    console.log("metal-rules | Registering Malediction System");

    // Initialize malediction data
    Hooks.on('init', () => {
        registerMaledictionPowers();
    });

    // Add malediction tracker to character sheets
    Hooks.on("renderActorSheet5eCharacter2", async function(sheet, [html]) {
        const actor = sheet.actor;
        if (!isAccursed(actor)) return;

        addMaledictionTracker(sheet, html, actor);
    });

    // Handle malediction usage (compendium-driven or name fallback)
    Hooks.on("dnd5e.useItem", (item, config, options) => {
        const key = getItemHandlerKey(item);
        const handler = HANDLERS[key];
        if (handler) {
            useMaledictionByHandler(item.actor, item, key, handler);
            return;
        }
        if (item.name?.startsWith("Malediction:")) {
            handleMaledictionUse(item, item.actor);
        }
    });
}
// --- Dispatcher support for compendium-driven features ---

const HANDLERS = {
    'accursed.malediction.evil-eye': applyEvilEye,
    'accursed.malediction.hex-armor': applyHexArmor,
    'accursed.malediction.shadow-step': applyShadowStep,
    'accursed.malediction.unholy-fury': applyUnholyFury,
    'accursed.malediction.brutal-fury': applyBrutalFury,
    'accursed.malediction.hex-shield': applyHexShield,
    'accursed.malediction.improved-shadow-step': applyImprovedShadowStep,
    'accursed.malediction.shroud-of-darkness': applyShroudOfDarkness
};

function getItemHandlerKey(item) {
    if (!item) return undefined;
    const byFlag = item.getFlag('metal-rules', 'handler');
    if (byFlag) return String(byFlag).toLowerCase();
    const ident = item.system?.identifier;
    if (ident) return String(ident).toLowerCase();
    return undefined;
}

async function useMaledictionByHandler(actor, item, key, handlerFn) {
    if (!actor || !item || typeof handlerFn !== 'function') return;

    // Determine usage model from item flags (defaults to doom-refresh)
    const usesModel = item.getFlag('metal-rules', 'uses') ?? 'doom-refresh';

    // Key for tracking uses on actor
    const malKey = key || (item.name?.toLowerCase());
    const uses = actor.getFlag('metal-rules', 'malediction-uses') || {};
    const currentUses = Number(uses[malKey] ?? 0);

    // Enforce usage constraints
    if (usesModel === 'doom-refresh') {
        if (currentUses <= 0) {
            ui.notifications.warn("No uses remaining! Refresh by activating Doom or completing a long rest.");
            return;
        }
    }
    if (usesModel === 'doom-only') {
        const doomActive = actor.getFlag('metal-rules', 'doom-active');
        if (!doomActive) {
            ui.notifications.warn("This malediction can only be used while in Doom form!");
            return;
        }
    }

    // Apply effect via handler
    const ok = await handlerFn(actor, item);
    if (!ok) return;

    // Consume use when applicable
    if (usesModel === 'doom-refresh') {
        uses[malKey] = currentUses - 1;
        await actor.setFlag('metal-rules', 'malediction-uses', uses);
    }

    // Chat summary
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `${actor.name} uses <strong>${item.name}</strong>.`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });

    actor.sheet.render();
}


function registerMaledictionPowers() {
    // Define all malediction powers
    CONFIG.METAL_RULES = CONFIG.METAL_RULES || {};
    CONFIG.METAL_RULES.MALEDICTIONS = {
        // Level 2 Maledictions
        "evil-eye": {
            name: "Evil Eye",
            level: 2,
            description: "As a Bonus Action, curse a creature you can see within 60ft. Until the start of your next turn, the first attack, skill check, or save they make has disadvantage.",
            actionType: "bonus",
            range: "60 feet",
            uses: "doom-refresh",
            target: "single"
        },
        "hex-armor": {
            name: "Hex Armor",
            level: 2,
            description: "If not wearing armor, add your Proficiency Bonus to your AC.",
            actionType: "passive",
            range: "self",
            uses: "permanent",
            target: "self"
        },
        "shadow-step": {
            name: "Shadow Step",
            level: 2,
            description: "When in dim light or darkness, cast Misty Step. Recovers when you activate Doom or complete a long rest.",
            actionType: "bonus",
            range: "30 feet",
            uses: "doom-refresh",
            target: "self"
        },
        "unholy-fury": {
            name: "Unholy Fury",
            level: 2,
            description: "While in Doom form, at the start of your turn gain advantage on STR-based melee attacks, but attacks against you have advantage until your next turn.",
            actionType: "free",
            range: "self",
            uses: "doom-only",
            target: "self"
        },

        // Level 9 Maledictions
        "brutal-fury": {
            name: "Brutal Fury",
            level: 9,
            description: "In Doom form, when you hit with an attack, you can forgo advantage to deal extra necrotic damage equal to 2x your Doom die.",
            actionType: "reaction",
            range: "self",
            uses: "doom-only",
            target: "self"
        },
        "hex-shield": {
            name: "Hex Shield",
            level: 9,
            description: "In Doom form, when you take damage from an attack within 5ft, use reaction to deal necrotic damage equal to your Doom die to the attacker.",
            actionType: "reaction",
            range: "5 feet",
            uses: "doom-only",
            target: "attacker"
        },
        "improved-shadow-step": {
            name: "Improved Shadow Step",
            level: 9,
            description: "When using Shadow Step, you can bring a creature with you. Unwilling creatures make CHA save (DC 8 + PB + CON mod) to resist.",
            actionType: "bonus",
            range: "30 feet",
            uses: "doom-refresh",
            target: "self-plus-one"
        },
        "shroud-of-darkness": {
            name: "Shroud of Darkness",
            level: 9,
            description: "If in dim light or darkness, cast Greater Invisibility on yourself. Recovers when you activate Doom or complete a long rest.",
            actionType: "action",
            range: "self",
            uses: "doom-refresh",
            target: "self"
        }
    };
}

function isAccursed(actor) {
    if (actor.type !== "character") return false;
    const classes = actor.items.filter(i => i.type === "class");
    return classes.some(cls => cls.name.toLowerCase().includes("accursed"));
}

function getAccursedLevel(actor) {
    const accursedClass = actor.items.find(i => 
        i.type === "class" && i.name.toLowerCase().includes("accursed")
    );
    return accursedClass?.system?.levels || 0;
}

function addMaledictionTracker(sheet, html, actor) {
    const accursedLevel = getAccursedLevel(actor);
    if (accursedLevel < 2) return; // Maledictions start at level 2

    const selectedMaledictions = actor.getFlag('metal-rules', 'maledictions') || [];
    const maledictionUses = actor.getFlag('metal-rules', 'malediction-uses') || {};

    // Remove existing tracker
    html.querySelector('.malediction-tracker')?.remove();

    // Create malediction tracker
    const maledictionContainer = document.createElement("div");
    maledictionContainer.className = "malediction-tracker card";
    maledictionContainer.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">Maledictions</h3>
            <button class="manage-maledictions" title="Manage Maledictions">⚙️</button>
        </div>
        <div class="card-content">
            ${createMaledictionList(selectedMaledictions, maledictionUses, accursedLevel)}
        </div>
    `;

    // Insert after doom tracker or stats
    const insertPoint = html.querySelector(".doom-tracker") || html.querySelector(".dnd5e2.sheet.actor.character .sheet-body .main-content .sidebar .card .stats");
    if (insertPoint) {
        insertPoint.insertAdjacentElement("afterend", maledictionContainer);
        addMaledictionEventListeners(maledictionContainer, actor);
    }
}

function createMaledictionList(selectedMaledictions, uses, accursedLevel) {
    if (selectedMaledictions.length === 0) {
        return `<div class="no-maledictions">No maledictions selected. Click ⚙️ to choose.</div>`;
    }

    let html = '<div class="malediction-list">';
    
    selectedMaledictions.forEach(maledictionId => {
        const malediction = CONFIG.METAL_RULES.MALEDICTIONS[maledictionId];
        if (!malediction) return;

        const currentUses = uses[maledictionId] || 0;
        const maxUses = getMaledictionMaxUses(malediction);
        const canUse = currentUses > 0 || malediction.uses === "permanent" || malediction.uses === "doom-only";

        html += `
            <div class="malediction-item" data-malediction="${maledictionId}">
                <div class="malediction-header">
                    <span class="malediction-name">${malediction.name}</span>
                    ${malediction.uses !== "permanent" ? `<span class="malediction-uses">${currentUses}/${maxUses}</span>` : ''}
                </div>
                <div class="malediction-description">${malediction.description}</div>
                <div class="malediction-actions">
                    <button class="use-malediction" ${!canUse ? 'disabled' : ''} data-malediction="${maledictionId}">
                        Use ${malediction.actionType === 'passive' ? '(Passive)' : '(' + capitalizeFirst(malediction.actionType) + ')'}
                    </button>
                    ${malediction.uses === "doom-refresh" ? '<button class="refresh-malediction" data-malediction="' + maledictionId + '" title="Refresh (Doom activation)">⚡</button>' : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

function addMaledictionEventListeners(container, actor) {
    // Manage maledictions button
    container.querySelector('.manage-maledictions')?.addEventListener('click', (e) => {
        e.preventDefault();
        openMaledictionManager(actor);
    });

    // Use malediction buttons
    container.querySelectorAll('.use-malediction').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const maledictionId = button.dataset.malediction;
            await useMalediction(actor, maledictionId);
        });
    });

    // Refresh malediction buttons
    container.querySelectorAll('.refresh-malediction').forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const maledictionId = button.dataset.malediction;
            await refreshMalediction(actor, maledictionId);
        });
    });
}

function openMaledictionManager(actor) {
    const accursedLevel = getAccursedLevel(actor);
    const selectedMaledictions = actor.getFlag('metal-rules', 'maledictions') || [];
    const maxMaledictions = getMaledictionSlots(accursedLevel);
    
    // Get available maledictions for this level
    const availableMaledictions = Object.entries(CONFIG.METAL_RULES.MALEDICTIONS)
        .filter(([id, mal]) => mal.level <= accursedLevel)
        .map(([id, mal]) => ({id, ...mal}));

    let content = `
        <div class="malediction-manager">
            <p>Choose ${maxMaledictions} maledictions (currently selected: ${selectedMaledictions.length}):</p>
            <div class="available-maledictions">
    `;

    availableMaledictions.forEach(mal => {
        const isSelected = selectedMaledictions.includes(mal.id);
        content += `
            <div class="malediction-option ${isSelected ? 'selected' : ''}" data-malediction="${mal.id}">
                <div class="mal-header">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} data-malediction="${mal.id}">
                    <strong>${mal.name}</strong> <em>(Level ${mal.level})</em>
                </div>
                <div class="mal-description">${mal.description}</div>
            </div>
        `;
    });

    content += `
            </div>
            <div class="manager-buttons">
                <button id="save-maledictions">Save Selection</button>
                <button id="cancel-maledictions">Cancel</button>
            </div>
        </div>
    `;

    new Dialog({
        title: "Manage Maledictions",
        content: content,
        buttons: {},
        default: "save",
        render: (html) => {
            // Handle checkbox changes
            html.find('input[type="checkbox"]').on('change', (e) => {
                const checkbox = e.target;
                const option = checkbox.closest('.malediction-option');
                const checked = checkbox.checked;
                const currentSelected = html.find('input[type="checkbox"]:checked').length;

                if (checked && currentSelected > maxMaledictions) {
                    checkbox.checked = false;
                    ui.notifications.warn(`You can only select ${maxMaledictions} maledictions.`);
                    return;
                }

                option.classList.toggle('selected', checked);
            });

            // Save button
            html.find('#save-maledictions').on('click', async (e) => {
                const selected = [];
                html.find('input[type="checkbox"]:checked').each((i, cb) => {
                    selected.push(cb.dataset.malediction);
                });

                await actor.setFlag('metal-rules', 'maledictions', selected);
                
                // Initialize uses for new maledictions
                const uses = actor.getFlag('metal-rules', 'malediction-uses') || {};
                selected.forEach(id => {
                    const mal = CONFIG.METAL_RULES.MALEDICTIONS[id];
                    if (mal && mal.uses === "doom-refresh") {
                        uses[id] = 1; // Start with 1 use
                    }
                });
                await actor.setFlag('metal-rules', 'malediction-uses', uses);

                ui.notifications.info("Maledictions updated!");
                actor.sheet.render();
                $(e.target).closest('.dialog').find('.close').click();
            });

            // Cancel button
            html.find('#cancel-maledictions').on('click', (e) => {
                $(e.target).closest('.dialog').find('.close').click();
            });
        }
    }).render(true);
}

async function useMalediction(actor, maledictionId) {
    const malediction = CONFIG.METAL_RULES.MALEDICTIONS[maledictionId];
    if (!malediction) return;

    const uses = actor.getFlag('metal-rules', 'malediction-uses') || {};
    const currentUses = uses[maledictionId] || 0;

    // Check if can use
    if (malediction.uses === "doom-refresh" && currentUses <= 0) {
        ui.notifications.warn("No uses remaining! Refresh by activating Doom or completing a long rest.");
        return;
    }

    if (malediction.uses === "doom-only") {
        const doomActive = actor.getFlag('metal-rules', 'doom-active');
        if (!doomActive) {
            ui.notifications.warn("This malediction can only be used while in Doom form!");
            return;
        }
    }

    // Use the malediction
    if (malediction.uses === "doom-refresh") {
        uses[maledictionId] = currentUses - 1;
        await actor.setFlag('metal-rules', 'malediction-uses', uses);
    }

    // Apply effects based on malediction type
    const success = await applyMaledictionEffect(actor, malediction);
    
    if (!success) return; // Effect application failed, don't consume use

    // Chat message
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `${actor.name} uses <strong>${malediction.name}</strong>!<br><em>${malediction.description}</em>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });

    // Re-render sheet
    actor.sheet.render();
}

async function applyMaledictionEffect(actor, malediction) {
    switch (malediction.name) {
        case "Evil Eye":
            return await applyEvilEye(actor);
            
        case "Hex Armor":
            return await applyHexArmor(actor);
            
        case "Shadow Step":
            return await applyShadowStep(actor);
            
        case "Unholy Fury":
            return await applyUnholyFury(actor);
            
        case "Brutal Fury":
            return await applyBrutalFury(actor);
            
        case "Hex Shield":
            return await applyHexShield(actor);
            
        case "Improved Shadow Step":
            return await applyImprovedShadowStep(actor);
            
        case "Shroud of Darkness":
            return await applyShroudOfDarkness(actor);
            
        default:
            ui.notifications.warn("This malediction effect is not yet implemented.");
            return true;
    }
}

async function applyEvilEye(actor) {
    // Check if we're in combat for targeting
    const combat = game.combat;
    let targets = [];
    
    if (game.user.targets.size > 0) {
        // Use selected targets
        targets = Array.from(game.user.targets);
    } else {
        // Prompt for target selection
        ui.notifications.info("Select a target within 60 feet for Evil Eye, then use the malediction again.");
        return false;
    }
    
    if (targets.length === 0) {
        ui.notifications.warn("No target selected for Evil Eye!");
        return false;
    }
    
    if (targets.length > 1) {
        ui.notifications.warn("Evil Eye can only target one creature!");
        return false;
    }
    
    const target = targets[0];
    // Measure distance between token centers if possible
    const sourceToken = actor.getActiveTokens()[0];
    const targetToken = target?.document ? target : target?.actor?.getActiveTokens?.()[0];
    let distance = 0;
    if (sourceToken && targetToken) {
        distance = canvas.grid.measureDistance(sourceToken.center, targetToken.center);
    }
    
    if (distance > 60) {
        ui.notifications.warn("Target is too far away! Evil Eye has a range of 60 feet.");
        return false;
    }
    
    // Apply Evil Eye curse effect
    const evilEyeEffect = {
        label: "Evil Eye Curse",
        icon: "icons/magic/control/debuff-energy-hold-levitate-red.webp",
        description: "The first attack roll, ability check, or saving throw has disadvantage",
        changes: [
            {
                key: "flags.midi-qol.disadvantage.attack.all",
                mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                value: "1"
            },
            {
                key: "flags.midi-qol.disadvantage.ability.check.all", 
                mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                value: "1"
            },
            {
                key: "flags.midi-qol.disadvantage.ability.save.all",
                mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                value: "1"
            }
        ],
        duration: {
            rounds: 1,
            turns: 1
        },
        flags: {
            "metal-rules": {
                "malediction": "evil-eye",
                "evil-eye-used": false
            },
            "core": {
                "statusId": "evil-eye-curse"
            }
        }
    };
    
    await target.actor.createEmbeddedDocuments("ActiveEffect", [evilEyeEffect]);
    
    // Create a chat message for the curse
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `${actor.name} curses ${target.name} with <strong>Evil Eye</strong>!<br>
                 <em>Their next attack roll, ability check, or saving throw will have disadvantage.</em>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    
    return true;
}

async function applyHexArmor(actor) {
    // Apply AC bonus if not wearing armor
    const armorItems = actor.items.filter(i => i.type === "equipment" && i.system.armor?.type);
    const wearingArmor = armorItems.some(item => item.system.equipped);
    
    if (wearingArmor) {
        ui.notifications.warn("Hex Armor can only be used when not wearing armor!");
        return false;
    }
    
    const existingEffect = actor.effects.find(e => e.label === "Hex Armor");
    if (existingEffect) {
        ui.notifications.info("Hex Armor is already active!");
        return false;
    }
    
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: "Hex Armor",
        icon: "icons/magic/defensive/shield-barrier-blue.webp",
        description: "Add Proficiency Bonus to AC when unarmored",
        changes: [{
            key: "system.attributes.ac.calc",
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "10 + @abilities.dex.mod + @prof"
        }],
        flags: {
            "metal-rules": {"malediction": "hex-armor"}
        }
    }]);
    
    return true;
}

async function applyShadowStep(actor) {
    // Check if in dim light or darkness
    const token = actor.token || actor.getActiveTokens()[0];
    if (!token) {
        ui.notifications.warn("No token found for Shadow Step!");
        return false;
    }
    
    // For now, we'll assume the GM/player knows if they're in appropriate lighting
    // In a more advanced implementation, you could check the lighting layer
    
    ui.notifications.info("Cast Misty Step! (Shadow Step requires dim light or darkness)");
    
    // Could integrate with actual Misty Step spell here if available
    // For now, just provide the effect reminder
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `${actor.name} uses <strong>Shadow Step</strong> to cast Misty Step!<br>
                 <em>Teleport up to 30 feet to an unoccupied space you can see.</em>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    
    return true;
}

async function applyUnholyFury(actor) {
    // Check if in Doom form
    const doomActive = actor.getFlag('metal-rules', 'doom-active');
    if (!doomActive) {
        ui.notifications.warn("Unholy Fury can only be used while in Doom form!");
        return false;
    }
    
    // Apply advantage to STR attacks but disadvantage to AC
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: "Unholy Fury",
        icon: "icons/magic/control/buff-strength-muscle-damage-red.webp",
        description: "Advantage on STR-based melee attacks, but attacks against you have advantage",
        changes: [
            {
                key: "flags.dnd5e.meleeWeaponAttack",
                mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                value: "1"
            },
            // Note: The "enemies have advantage" part would need to be tracked manually
            // or with more complex effect system
        ],
        duration: {
            rounds: 1
        },
        flags: {
            "metal-rules": {"malediction": "unholy-fury"}
        }
    }]);
    
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `${actor.name} enters <strong>Unholy Fury</strong>!<br>
                 <em>Gains advantage on STR-based melee attacks, but attacks against them have advantage until their next turn.</em>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    
    return true;
}

async function applyBrutalFury(actor) {
    const doomActive = actor.getFlag('metal-rules', 'doom-active');
    if (!doomActive) {
        ui.notifications.warn("Brutal Fury can only be used while in Doom form!");
        return false;
    }
    
    ui.notifications.info("Brutal Fury activated! On your next attack hit, you can forgo advantage to deal extra necrotic damage equal to 2x your Doom die.");
    
    // Apply a reminder effect
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: "Brutal Fury Ready",
        icon: "icons/magic/death/skull-energy-light-pink.webp",
        description: "Next attack hit: forgo advantage for +2x Doom die necrotic damage",
        duration: {
            rounds: 10 // Long enough for the next attack
        },
        flags: {
            "metal-rules": {"malediction": "brutal-fury"}
        }
    }]);
    
    return true;
}

async function applyHexShield(actor) {
    const doomActive = actor.getFlag('metal-rules', 'doom-active');
    if (!doomActive) {
        ui.notifications.warn("Hex Shield can only be used while in Doom form!");
        return false;
    }
    
    ui.notifications.info("Hex Shield activated! When you take damage from an attack within 5ft, you can use your reaction to deal necrotic damage equal to your Doom die.");
    
    // Apply a reminder effect
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: "Hex Shield Active",
        icon: "icons/magic/defensive/shield-barrier-deflect-red.webp",
        description: "Reaction: Deal Doom die necrotic damage to attackers within 5ft",
        duration: {
            rounds: 10
        },
        flags: {
            "metal-rules": {"malediction": "hex-shield"}
        }
    }]);
    
    return true;
}

async function applyImprovedShadowStep(actor) {
    ui.notifications.info("Improved Shadow Step activated! Cast Misty Step and optionally bring a creature with you (unwilling creatures get CHA save).");
    
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: actor}),
        content: `${actor.name} uses <strong>Improved Shadow Step</strong>!<br>
                 <em>Can teleport and bring one creature (willing or unwilling with CHA save DC ${8 + actor.system.attributes.prof + actor.system.abilities.con.mod}).</em>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    
    return true;
}

async function applyShroudOfDarkness(actor) {
    ui.notifications.info("Shroud of Darkness activated! Cast Greater Invisibility on yourself (requires dim light or darkness).");
    
    // Apply Greater Invisibility effect
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        label: "Greater Invisibility (Shroud)",
        icon: "icons/magic/perception/shadow-stealth-eyes-purple.webp",
        description: "Invisible and attacks have advantage",
        changes: [
            {
                key: "system.traits.ci.value",
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                value: "invisible"
            },
            {
                key: "flags.midi-qol.advantage.attack.all",
                mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                value: "1"
            }
        ],
        duration: {
            seconds: 60 // 1 minute
        },
        flags: {
            "metal-rules": {"malediction": "shroud-of-darkness"}
        }
    }]);
    
    return true;
}

async function refreshMalediction(actor, maledictionId) {
    const uses = actor.getFlag('metal-rules', 'malediction-uses') || {};
    uses[maledictionId] = 1;
    await actor.setFlag('metal-rules', 'malediction-uses', uses);
    
    ui.notifications.info("Malediction use refreshed!");
    actor.sheet.render();
}

function getMaledictionSlots(accursedLevel) {
    if (accursedLevel >= 13) return 3;
    if (accursedLevel >= 9) return 2;
    if (accursedLevel >= 2) return 2;
    return 0;
}

function getMaledictionMaxUses(malediction) {
    switch (malediction.uses) {
        case "doom-refresh": return 1;
        case "permanent": return "∞";
        case "doom-only": return "∞";
        default: return 1;
    }
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Handle long rest recovery for maledictions
Hooks.on("dnd5e.restCompleted", (actor, result) => {
    if (!isAccursed(actor) || result.restType !== "long") return;
    
    const selectedMaledictions = actor.getFlag('metal-rules', 'maledictions') || [];
    const uses = {};
    
    selectedMaledictions.forEach(id => {
        const mal = CONFIG.METAL_RULES.MALEDICTIONS[id];
        if (mal && mal.uses === "doom-refresh") {
            uses[id] = 1;
        }
    });
    
    actor.setFlag('metal-rules', 'malediction-uses', uses);
    
    if (!result.updates) result.updates = {};
    result.updates.maledictions = {
        recovered: selectedMaledictions.length
    };
});

// Refresh maledictions when Doom is activated
Hooks.on("metal-rules.doomActivated", (actor) => {
    const selectedMaledictions = actor.getFlag('metal-rules', 'maledictions') || [];
    const uses = actor.getFlag('metal-rules', 'malediction-uses') || {};
    
    selectedMaledictions.forEach(id => {
        const mal = CONFIG.METAL_RULES.MALEDICTIONS[id];
        if (mal && mal.uses === "doom-refresh") {
            uses[id] = 1;
        }
    });
    
    actor.setFlag('metal-rules', 'malediction-uses', uses);
});
