import { libWrapper } from "../lib/shim.js";

export const moduleName = "metal-rules";

export function register() {
    console.log("metal-rules | Registering Accursed Class");

    // Register the Accursed class data
    Hooks.on('init', () => {
        registerAccursedClass();
        registerAccursedItems();
    });

    // Handle Doom transformation
    Hooks.on("renderActorSheet5eCharacter2", async function(sheet, [html]) {
        const actor = sheet.actor;
        if (!isAccursed(actor)) return;

        addDoomTracker(sheet, html, actor);
    });

    // Handle Doom mechanics in combat
    Hooks.on("dnd5e.useItem", (item, config, options) => {
        if (item.name === "Doom Transformation") {
            handleDoomTransformation(item.actor);
        }
    });
}

function registerAccursedClass() {
    // Add Accursed to class list
    CONFIG.DND5E.classFeatures = foundry.utils.mergeObject(CONFIG.DND5E.classFeatures, {
        "accursed": {
            "affliction": {
                "label": "Affliction",
                "visible": true
            },
            "doom": {
                "label": "Doom",
                "visible": true
            },
            "darksenses": {
                "label": "Dark Senses",
                "visible": true
            },
            "malediction": {
                "label": "Malediction",
                "visible": true
            },
            "soulprotection": {
                "label": "Soul Protection",
                "visible": true
            },
            "relentlessdoom": {
                "label": "Relentless Doom",
                "visible": true
            },
            "persistentdoom": {
                "label": "Persistent Doom",
                "visible": true
            },
            "magicresistance": {
                "label": "Magic Resistance",
                "visible": true
            },
            "indomitablemight": {
                "label": "Indomitable Might",
                "visible": true
            },
            "anathema": {
                "label": "Anathema",
                "visible": true
            }
        }
    });

    // Add Accursed to class configuration
    if (!CONFIG.DND5E.classes) CONFIG.DND5E.classes = {};
    CONFIG.DND5E.classes.accursed = {
        label: "Accursed",
        primaryAbility: "con",
        hitDie: 8,
        proficiencies: {
            armor: ["light", "medium"],
            weapons: ["simple", "martial"],
            savingThrows: ["con", "cha"],
            skills: {
                choose: 2,
                from: ["ath", "dec", "inti", "his", "sur"]
            }
        },
        spellcasting: {
            type: "none"
        }
    };
}

function registerAccursedItems() {
    // This would typically create compendium items, but for now we'll add them dynamically
    console.log("metal-rules | Accursed items registered");
}

function isAccursed(actor) {
    if (actor.type !== "character") return false;
    
    // Check if actor has Accursed class
    const classes = actor.items.filter(i => i.type === "class");
    return classes.some(cls => cls.name.toLowerCase().includes("accursed"));
}

function addDoomTracker(sheet, html, actor) {
    const accursedLevel = getAccursedLevel(actor);
    if (accursedLevel === 0) return;

    const currentDoom = actor.getFlag('metal-rules', 'doom-active') || false;
    const doomUses = actor.getFlag('metal-rules', 'doom-uses') || getDoomUsesPerLevel(accursedLevel);
    const maxDoomUses = getDoomUsesPerLevel(accursedLevel);

    // Remove existing doom tracker
    html.querySelector('.doom-tracker')?.remove();

    // Create doom tracker
    const doomContainer = document.createElement("div");
    doomContainer.className = "doom-tracker card";
    doomContainer.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">Doom Transformation</h3>
        </div>
        <div class="card-content">
            <div class="doom-status">
                <div class="doom-state ${currentDoom ? 'active' : 'inactive'}">
                    <span class="doom-label">${currentDoom ? 'ACTIVE' : 'INACTIVE'}</span>
                    <button class="doom-toggle" ${doomUses <= 0 && !currentDoom ? 'disabled' : ''}>
                        ${currentDoom ? 'End Doom' : 'Activate Doom'}
                    </button>
                </div>
                <div class="doom-uses">
                    <span>Uses: ${doomUses}/${maxDoomUses}</span>
                    <button class="doom-rest" title="Short Rest Recovery">⚡</button>
                </div>
            </div>
            <div class="doom-benefits ${currentDoom ? 'visible' : 'hidden'}">
                <div class="doom-bonus">Doom Bonus: +${getDoomBonus(accursedLevel)}</div>
                <div class="doom-effects">
                    <span>• ${2 * accursedLevel} Temp HP</span>
                    <span>• Resistance to B/P/S</span>
                    <span>• STR Advantage</span>
                    <span>• No Spell Concentration</span>
                </div>
            </div>
        </div>
    `;

    // Insert after stats
    const insertPoint = html.querySelector(".dnd5e2.sheet.actor.character .sheet-body .main-content .sidebar .card .stats");
    if (insertPoint) {
        insertPoint.insertAdjacentElement("afterend", doomContainer);
        addDoomEventListeners(doomContainer, actor);
    }
}

function addDoomEventListeners(container, actor) {
    const toggleButton = container.querySelector('.doom-toggle');
    const restButton = container.querySelector('.doom-rest');

    toggleButton?.addEventListener('click', async (e) => {
        e.preventDefault();
        await toggleDoomTransformation(actor);
    });

    restButton?.addEventListener('click', async (e) => {
        e.preventDefault();
        await recoverDoomUses(actor);
    });
}

async function toggleDoomTransformation(actor) {
    const currentDoom = actor.getFlag('metal-rules', 'doom-active') || false;
    const doomUses = actor.getFlag('metal-rules', 'doom-uses') || getDoomUsesPerLevel(getAccursedLevel(actor));
    const accursedLevel = getAccursedLevel(actor);

    if (!currentDoom) {
        // Activate Doom
        if (doomUses <= 0) {
            ui.notifications.warn("No Doom uses remaining!");
            return;
        }

        await actor.setFlag('metal-rules', 'doom-active', true);
        await actor.setFlag('metal-rules', 'doom-uses', doomUses - 1);
        
        // Add temporary HP
        const tempHP = 2 * accursedLevel;
        const currentTempHP = actor.system.attributes.hp.temp || 0;
        await actor.update({"system.attributes.hp.temp": Math.max(currentTempHP, tempHP)});

        // Add active effects for resistances and advantages
        await addDoomEffects(actor);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: `${actor.name} activates their Doom transformation!<br>
                     • Gained ${tempHP} temporary hit points<br>
                     • Gained resistance to bludgeoning, piercing, and slashing damage<br>
                     • Gained advantage on Strength checks and saves<br>
                     • Cannot concentrate on spells`,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });

    } else {
        // Deactivate Doom
        await actor.setFlag('metal-rules', 'doom-active', false);
        await removeDoomEffects(actor);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: `${actor.name} ends their Doom transformation.`,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
    }

    // Re-render the sheet to update the tracker
    actor.sheet.render();
}

async function addDoomEffects(actor) {
    const effects = [
        {
            label: "Doom - Physical Resistance",
            icon: "icons/magic/defensive/shield-barrier-flaming-diamond-red.webp",
            changes: [
                {
                    key: "system.traits.dr.value",
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: "bludgeoning"
                },
                {
                    key: "system.traits.dr.value", 
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: "piercing"
                },
                {
                    key: "system.traits.dr.value",
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                    value: "slashing"
                }
            ],
            duration: {
                seconds: 600 // 10 minutes default, can be extended by features
            },
            flags: {
                "metal-rules": {
                    "doom-effect": true
                }
            }
        },
        {
            label: "Doom - Strength Advantage",
            icon: "icons/magic/control/buff-strength-muscle-damage-red.webp", 
            changes: [
                {
                    key: "flags.dnd5e.advantageOnStrength",
                    mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                    value: "1"
                }
            ],
            duration: {
                seconds: 600
            },
            flags: {
                "metal-rules": {
                    "doom-effect": true
                }
            }
        }
    ];

    for (const effectData of effects) {
        await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
}

async function removeDoomEffects(actor) {
    const doomEffects = actor.effects.filter(e => e.flags["metal-rules"]?.["doom-effect"]);
    const effectIds = doomEffects.map(e => e.id);
    if (effectIds.length > 0) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    }
}

async function recoverDoomUses(actor) {
    const accursedLevel = getAccursedLevel(actor);
    const maxUses = getDoomUsesPerLevel(accursedLevel);
    
    await actor.setFlag('metal-rules', 'doom-uses', maxUses);
    ui.notifications.info(`${actor.name} recovered all Doom uses.`);
    actor.sheet.render();
}

function getAccursedLevel(actor) {
    const accursedClass = actor.items.find(i => 
        i.type === "class" && i.name.toLowerCase().includes("accursed")
    );
    return accursedClass?.system?.levels || 0;
}

function getDoomUsesPerLevel(level) {
    if (level >= 12) return level >= 17 ? 6 : 5;
    if (level >= 6) return 4;
    if (level >= 3) return 3;
    return 2;
}

function getDoomBonus(level) {
    if (level >= 16) return "1d8";
    if (level >= 9) return "1d6";
    return "1d4";
}

// Handle long rest recovery
Hooks.on("dnd5e.restCompleted", (actor, result) => {
    if (!isAccursed(actor) || result.restType !== "long") return;
    
    const accursedLevel = getAccursedLevel(actor);
    const maxUses = getDoomUsesPerLevel(accursedLevel);
    
    actor.setFlag('metal-rules', 'doom-uses', maxUses);
    
    if (!result.updates) result.updates = {};
    result.updates.doomUses = {
        recovered: maxUses
    };
});

// Add doom recovery to rest chat message
Hooks.on("dnd5e.displayRestResultMessage", (chatData, result) => {
    if (result.restType !== "long" || !result.updates?.doomUses) return;
    
    chatData.content += `<p><strong>Doom Recovery:</strong> All uses recovered</p>`;
});