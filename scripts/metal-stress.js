import { libWrapper } from "../lib/shim.js";

export const moduleName = "metal-rules";

export function register() {
    console.log("metal-rules | Registering Stress Counter");

    // Register custom status effect icon for Stress
    Hooks.on('init', () => {
        const exists = CONFIG.statusEffects?.some(se => se.id === 'stress');
        if (!exists) {
            CONFIG.statusEffects?.push({
                id: 'stress',
                label: 'Stress',
                icon: 'icons/svg/terror.svg'
            });
        }
    });

    // Add stress to actor data preparation
    Hooks.on("dnd5e.prepareActorData", (actor) => {
        if (actor.type !== "character") return;
        
        // Ensure a default stress value via flags API instead of mutating actor.system directly
        if (actor.getFlag('metal-rules', 'stress') === undefined) {
            actor.setFlag('metal-rules', 'stress', 0);
        }
        
        // Apply stress penalties (same as exhaustion but only use the higher penalty)
        applyStressPenalties(actor);
    });

    // Penalty is applied via Active Effect; no risky roll-time mutation needed

    // Update effect when exhaustion changes
    Hooks.on('updateActor', (actor, changes) => {
        const changedExhaustion = foundry.utils.getProperty(changes, 'system.attributes.exhaustion');
        if (changedExhaustion !== undefined) {
            ensureStressEffect(actor);
        }
    });

    // Render the stress tracker on character sheets
    Hooks.on("renderActorSheet5eCharacter2", async function(sheet, html) {
        console.log("### metal - sheet mode : ", sheet._mode);

        const root = html instanceof HTMLElement ? html : (html?.[0] ?? html);
        const actor = sheet.actor;
        const currentStress = actor.getFlag('metal-rules', 'stress') || 0;

        // Remove existing stress tracker to avoid duplicates
        root.querySelector('.stress-tracker')?.remove();

        // Create stress tracker container
        const stressContainer = document.createElement("div");
        stressContainer.className = "stress-tracker card";
        stressContainer.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">Stress</h3>
            </div>
            <div class="card-content stress-pips">
                ${createStressPips(currentStress)}
            </div>
        `;

        // Insert after the stats section
        const insertPoint = root.querySelector(".dnd5e2.sheet.actor.character .sheet-body .main-content .sidebar .card .stats");
        if (insertPoint) {
            insertPoint.insertAdjacentElement("afterend", stressContainer);
            
            // Add click handlers for stress pips
            addStressClickHandlers(stressContainer, actor);
        }
    });

    // Add context menu options for stress
    Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
        if (sheet.actor.type !== "character") return;
        
        buttons.unshift({
            label: "Reset Stress",
            class: "reset-stress",
            icon: "fas fa-undo",
            onclick: () => resetStress(sheet.actor)
        });
    });
}

function createStressPips(currentStress) {
    let html = "";
    for (let i = 1; i <= 6; i++) {
        const filled = i <= currentStress;
        html += `
            <button type="button" 
                    class="stress-pip ${filled ? 'filled' : ''}" 
                    data-stress="${i}"
                    role="button"
                    aria-label="Stress ${i}"
                    aria-pressed="${filled}">
                <i class="fas fa-circle"></i>
            </button>
        `;
    }
    return html;
}

function addStressClickHandlers(container, actor) {
    const pips = container.querySelectorAll('.stress-pip');
    // Ensure no tooltips are attached to pips to avoid flicker
    pips.forEach(p => {
        p.removeAttribute('data-tooltip');
        p.title = '';
        p.setAttribute('tabindex', '-1');
    });
    
    pips.forEach(pip => {
        pip.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const stressLevel = parseInt(pip.dataset.stress);
            const currentStress = actor.getFlag('metal-rules', 'stress') || 0;
            
            let newStress;
            if (stressLevel <= currentStress) {
                // Clicking on a filled pip or below - set to one less
                newStress = stressLevel - 1;
            } else {
                // Clicking on an empty pip - set to that level
                newStress = stressLevel;
            }
            
            newStress = Math.max(0, Math.min(6, newStress));
            await setStress(actor, newStress);
            
            // Update the visual display
            updateStressPips(container, newStress);
        });
        
        // Right-click to decrease stress
        pip.addEventListener('contextmenu', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const currentStress = actor.getFlag('metal-rules', 'stress') || 0;
            const newStress = Math.max(0, currentStress - 1);
            await setStress(actor, newStress);
            updateStressPips(container, newStress);
        });
    });
}

function updateStressPips(container, stressLevel) {
    const pips = container.querySelectorAll('.stress-pip');
    pips.forEach((pip, index) => {
        const pipLevel = index + 1;
        if (pipLevel <= stressLevel) {
            pip.classList.add('filled');
            pip.setAttribute('aria-pressed', 'true');
        } else {
            pip.classList.remove('filled');
            pip.setAttribute('aria-pressed', 'false');
        }
    });
}

async function setStress(actor, stressLevel) {
    await actor.setFlag('metal-rules', 'stress', stressLevel);
    
    // Get the effective penalty after prepare data (flag update triggers prepare)
    const effectivePenalty = actor.system.stressExhaustionPenalty || 0;
    await ensureStressEffect(actor);
    const exhaustionLevel = actor.system.attributes?.exhaustion || 0;
    
    // Optional: Chat message for stress changes
    if (game.settings.get('metal-rules', 'announceStress')) {
        let message = `Stress level: ${stressLevel}/6`;
        if (effectivePenalty !== 0) {
            message += ` (${effectivePenalty >= 0 ? "+" : ""}${effectivePenalty} to d20 rolls)`;
        }
        if (exhaustionLevel > 0) {
            message += ` [Exhaustion: ${exhaustionLevel}]`;
        }
        
        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: message,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
    }
    
    console.log(`metal-rules | ${actor.name} stress set to ${stressLevel}, effective penalty: ${effectivePenalty}`);
}

async function resetStress(actor) {
    await setStress(actor, 0);
    ui.notifications.info(`${actor.name}'s stress has been reset.`);
}

// Register game settings
Hooks.on('init', () => {
    game.settings.register('metal-rules', 'announceStress', {
        name: 'Announce Stress Changes',
        hint: 'Post stress level changes to chat',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });
});

// Apply stress penalties to actor
function applyStressPenalties(actor) {
    const stressLevel = actor.getFlag('metal-rules', 'stress') || 0;
    const exhaustionLevel = actor.system.attributes?.exhaustion || 0;
    
    // Calculate penalties: -2 per level for both stress and exhaustion
    const stressPenalty = stressLevel * -2;
    const exhaustionPenalty = exhaustionLevel * -2;
    
    // Use the worse (more negative) penalty between stress and exhaustion
    const finalPenalty = Math.min(stressPenalty, exhaustionPenalty);
    
    // Store the penalty value for roll formulas to use (consumed by the Stress effect changes)
    actor.system.stressExhaustionPenalty = finalPenalty;
    
    // Console log for debugging
    if (stressLevel > 0 || exhaustionLevel > 0) {
        console.log(`metal-rules | ${actor.name}: Stress: ${stressLevel} (${stressPenalty}), Exhaustion: ${exhaustionLevel} (${exhaustionPenalty}), Applied: ${finalPenalty}`);
    }
}

function getFinalStressExhaustionPenalty(actor) {
    const stressLevel = actor.getFlag('metal-rules', 'stress') || 0;
    const exhaustionLevel = actor.system.attributes?.exhaustion || 0;
    const stressPenalty = stressLevel * -2;
    const exhaustionPenalty = exhaustionLevel * -2;
    return Math.min(stressPenalty, exhaustionPenalty);
}

function addPenaltyToRollParts(target, actor) {
    const penalty = getFinalStressExhaustionPenalty(actor);
    if (!penalty) return;
    // Prefer parts array if present
    if (Array.isArray(target.parts)) {
        if (!target.parts.includes(String(penalty))) target.parts.push(String(penalty));
        return;
    }
    // Fallback: append to formula if present
    if (typeof target.formula === 'string' && target.formula.length) {
        if (!target.formula.includes(String(penalty))) target.formula += ` + ${penalty}`;
        return;
    }
    // Last resort: create parts
    target.parts = [String(penalty)];
}

async function ensureStressEffect(actor) {
    const stress = actor.getFlag('metal-rules', 'stress') || 0;
    const exhaustionLevel = actor.system.attributes?.exhaustion || 0;
    const stressPenalty = (stress || 0) * -2;
    const exhaustionPenalty = (exhaustionLevel || 0) * -2;
    const finalPenalty = Math.min(stressPenalty, exhaustionPenalty);
    const deltaPenalty = finalPenalty - exhaustionPenalty; // Only add beyond exhaustion already applied by system

    let effect = actor.effects.find(e => e.getFlag('metal-rules', 'stress-effect') === true);
    const label = `Stress/Exhaustion Penalty (${finalPenalty})`;
    const icon = 'icons/svg/terror.svg';
    const changes = [
        { key: 'system.bonuses.abilities.check', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty },
        { key: 'system.bonuses.abilities.save', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty },
        { key: 'system.bonuses.mwak.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty },
        { key: 'system.bonuses.rwak.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty },
        { key: 'system.bonuses.msak.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty },
        { key: 'system.bonuses.rsak.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty }
    ];
    // Ensure ability-specific bonuses are also affected in v4
    const abilityKeys = ['str','dex','con','int','wis','cha'];
    for (const abl of abilityKeys) {
        changes.push({ key: `system.abilities.${abl}.checkBonus`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty });
        changes.push({ key: `system.abilities.${abl}.saveBonus`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: deltaPenalty });
    }

    if (!effect) {
        await actor.createEmbeddedDocuments('ActiveEffect', [{
            label,
            icon,
            changes,
            flags: { 'metal-rules': { 'stress-effect': true } },
            statuses: ['stress'],
            disabled: finalPenalty === 0
        }]);
    } else {
        await effect.update({ label, changes, disabled: finalPenalty === 0 });
    }
}