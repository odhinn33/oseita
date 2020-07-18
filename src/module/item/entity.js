import { OseDice } from "../dice.js";

/**
 * Override and extend the basic :class:`Item` implementation
 */
export class OseItem extends Item {
  /* -------------------------------------------- */
  /*	Data Preparation														*/
  /* -------------------------------------------- */

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    super.prepareData();
  }

  static chatListeners(html) {
    html.on("click", ".card-buttons button", this._onChatCardAction.bind(this));
    html.on("click", ".item-name", this._onChatCardToggleContent.bind(this));
  }

  getChatData(htmlOptions) {
    const data = duplicate(this.data.data);

    // Rich text description
    data.description = TextEditor.enrichHTML(data.description, htmlOptions);

    // Item properties
    const props = [];
    const labels = this.labels;

    if (this.data.type == "weapon") {
      props.push(data.qualities);
    }
    if (this.data.type == "spell") {
      props.push(`${data.class} ${data.lvl}`, data.range, data.duration);
    }
    if (data.hasOwnProperty("equipped")) {
      props.push(data.equipped ? "Equipped" : "Not Equipped");
    }

    // Filter properties and return
    data.properties = props.filter((p) => !!p);
    return data;
  }

  rollWeapon(options = {}) {
    let isNPC = this.actor.data.type != "character";
    const data = this.data.data;
    let type = "raw";
    if (data.missile && data.melee && !isNPC) {
      // Dialog
      new Dialog({
        title: "Choose Attack Range",
        content: "",
        buttons: {
          melee: {
            icon: '<i class="fas fa-fist-raised"></i>',
            label: "Melee",
            callback: () => {
              this.actor.rollAttack(
                {
                  type: "melee",
                  label: this.name,
                  dmg: this.data.data.damage,
                  bonus: data.bonus,
                },
                options
              );
            },
          },
          missile: {
            icon: '<i class="fas fa-bullseye"></i>',
            label: "Missile",
            callback: () => {
              this.actor.rollAttack(
                {
                  type: "missile",
                  label: this.name,
                  dmg: this.data.data.damage,
                },
                options
              );
            },
          },
        },
        default: "melee",
      }).render(true);
      return true;
    } else if (data.missile && !isNPC) {
      type = "missile";
    } else if (data.melee && !isNPC) {
      type = "melee";
    }
    this.actor.rollAttack(
      { type: type, label: this.name, dmg: data.damage, bonus: data.bonus },
      options
    );

    return true;
  }

  async rollFormula(options = {}) {
    const data = this.data.data;
    if (!data.roll) {
      throw new Error("This Item does not have a formula to roll!");
    }

    const label = `${this.name}`;
    const rollParts = [data.roll];

    let type = data.rollType;

    const newData = {
      ...this.data,
      ...{
        rollData: {
          type: type,
          target: data.rollTarget,
          blindroll: data.blindroll,
        },
      },
    };

    // Roll and return
    return OseDice.Roll({
      event: options.event,
      parts: rollParts,
      data: newData,
      skipDialog: true,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("OSE.roll.formula", { label: label }),
      title: game.i18n.format("OSE.roll.formula", { label: label }),
    });
  }

  spendSpell() {
    this.update({
      data: {
        cast: this.data.data.cast - 1,
      },
    }).then(() => {
      this.roll({ skipDialog: true });
    });
  }

  getTags() {
    let formatTag = (tag) => {
      if (!tag) return "";
      return `<li class='tag'>${tag}</li>`;
    };

    const data = this.data.data;
    switch (this.data.type) {
      case "weapon":
        let wTags = formatTag(data.damage);
        data.tags.forEach(t => {
          wTags += formatTag(t.value);
        })
        return wTags;
      case "armor":
        return `${formatTag(CONFIG.OSE.armor[data.type])}`;
      case "item":
        return "";
      case "spell":
        return `${formatTag(data.class)}${formatTag(data.range)}${formatTag(
          data.duration
        )}${formatTag(CONFIG.OSE.saves_long[data.save])}${formatTag(
          data.roll
        )}`;
      case "ability":
        let roll = "";
        roll += data.roll ? data.roll : "";
        roll += data.rollType ? CONFIG.OSE.roll_type[data.rollType] : "";
        roll += data.rollTarget ? data.rollTarget : "";
        return `${formatTag(data.requirements)}${formatTag(roll)}`;
    }
    return "";
  }

  pushTag(values) {
    const data = this.data.data;
    let update = [];
    if (data.tags) {
      update = duplicate(data.tags);
    }
    let newData = {};
    var regExp = /\(([^)]+)\)/;
    if (update) {
      values.forEach((val) => {
        // Catch infos in brackets
        var matches = regExp.exec(val);
        let title = "";
        if (matches) {
          title = matches[1];
          val = val.substring(0, matches.index).trim();
        } else {
          val = val.trim();
          title = val;
        }
        // Auto fill checkboxes
        switch (val) {
          case CONFIG.OSE.tags.melee:
            newData.melee = true;
            break;
          case CONFIG.OSE.tags.slow:
            newData.slow = true;
            break;
          case CONFIG.OSE.tags.missile:
            newData.missile = true;
            break;
        }
        update.push({ title: title, value: val });
      });
    } else {
      update = values;
    }
    newData.tags = update;
    return this.update({ data: newData });
  }

  popTag(value) {
    const data = this.data.data;
    let update = data.tags.filter((el) => el.value != value);
    let newData = {
      tags: update,
    };
    return this.update({ data: newData });
  }

  /**
   * Roll the item to Chat, creating a chat card which contains follow up attack or damage roll options
   * @return {Promise}
   */
  async roll({ skipDialog = false } = {}) {
    if (this.data.type == "weapon") {
      if (this.rollWeapon(skipDialog)) return;
    }
    // Basic template rendering data
    const token = this.actor.token;
    const templateData = {
      actor: this.actor,
      tokenId: token ? `${token.scene._id}.${token.id}` : null,
      item: this.data,
      data: this.getChatData(),
      labels: this.labels,
      isHealing: this.isHealing,
      hasDamage: this.hasDamage,
      isSpell: this.data.type === "spell",
      hasSave: this.hasSave,
      config: CONFIG.OSE,
    };

    // Render the chat card template
    const template = `systems/ose/templates/chat/item-card.html`;
    const html = await renderTemplate(template, templateData);

    // Basic chat message data
    const chatData = {
      user: game.user._id,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      content: html,
      speaker: {
        actor: this.actor._id,
        token: this.actor.token,
        alias: this.actor.name,
      },
    };

    // Toggle default roll mode
    let rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode))
      chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user._id];
    if (rollMode === "blindroll") chatData["blind"] = true;

    // Create the chat message
    return ChatMessage.create(chatData);
  }

  /**
   * Handle toggling the visibility of chat card content when the name is clicked
   * @param {Event} event   The originating click event
   * @private
   */
  static _onChatCardToggleContent(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const card = header.closest(".chat-card");
    const content = card.querySelector(".card-content");
    if (content.style.display == "none") {
      $(content).slideDown(200);
    } else {
      $(content).slideUp(200);
    }
  }

  static async _onChatCardAction(event) {
    event.preventDefault();

    // Extract card data
    const button = event.currentTarget;
    button.disabled = true;
    const card = button.closest(".chat-card");
    const messageId = card.closest(".message").dataset.messageId;
    const message = game.messages.get(messageId);
    const action = button.dataset.action;

    // Validate permission to proceed with the roll
    const isTargetted = action === "save";
    if (!(isTargetted || game.user.isGM || message.isAuthor)) return;

    // Get the Actor from a synthetic Token
    const actor = this._getChatCardActor(card);
    if (!actor) return;

    // Get the Item
    const item = actor.getOwnedItem(card.dataset.itemId);
    if (!item) {
      return ui.notifications.error(
        `The requested item ${card.dataset.itemId} no longer exists on Actor ${actor.name}`
      );
    }

    // Get card targets
    let targets = [];
    if (isTargetted) {
      targets = this._getChatCardTargets(card);
    }

    // Attack and Damage Rolls
    if (action === "damage") await item.rollDamage({ event });
    else if (action === "formula") await item.rollFormula({ event });
    // Saving Throws for card targets
    else if (action == "save") {
      if (!targets.length) {
        ui.notifications.warn(
          `You must have one or more controlled Tokens in order to use this option.`
        );
        return (button.disabled = false);
      }
      for (let t of targets) {
        await t.rollSave(button.dataset.save, { event });
      }
    }

    // Re-enable the button
    button.disabled = false;
  }

  static _getChatCardActor(card) {
    // Case 1 - a synthetic actor from a Token
    const tokenKey = card.dataset.tokenId;
    if (tokenKey) {
      const [sceneId, tokenId] = tokenKey.split(".");
      const scene = game.scenes.get(sceneId);
      if (!scene) return null;
      const tokenData = scene.getEmbeddedEntity("Token", tokenId);
      if (!tokenData) return null;
      const token = new Token(tokenData);
      return token.actor;
    }

    // Case 2 - use Actor ID directory
    const actorId = card.dataset.actorId;
    return game.actors.get(actorId) || null;
  }

  static _getChatCardTargets(card) {
    const character = game.user.character;
    const controlled = canvas.tokens.controlled;
    const targets = controlled.reduce(
      (arr, t) => (t.actor ? arr.concat([t.actor]) : arr),
      []
    );
    if (character && controlled.length === 0) targets.push(character);
    return targets;
  }
}
