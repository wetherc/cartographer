# Characters

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

## Party roster

The Party card lists the characters. The selected character sets what the
character detail card shows.

| Control | Who | What it does |
| --- | --- | --- |
| Row name | Everyone | Selects the character |
| Edit character (pencil) | GM | Opens the edit dialog of that character |
| Open player tab (arrow out of a box) | GM | Opens a Player tab bound to that character in a new browser tab |
| Place on map | GM, while the party is split | Moves that character. See [Party splitting](play.md#party-splitting) |
| More actions (three dots) | GM | Opens a menu with **Grant XP**, which grants XP to that character alone (the default is 100), and **Delete**, which deletes the character after a confirm |
| New character | GM | Opens character creation |
| Award Party XP | GM | Grants XP to every living character: the same amount to each, or a total split evenly among them and rounded down. A dead character gets nothing and does not count in the split. The default is 100 per character |
| Spectator tab | GM | Opens a Player tab bound to no character |
| Allow splitting the party | GM | See [Party splitting](play.md#party-splitting) |
| Playing as | Player tab | Binds the tab to a character. Locked in a tab opened from a player tab link, until the tab loses its character |

Open player tab is an ordinary link, so a middle-click or the "Open in new
tab" menu of the browser also works on it. Spectator tab is a button. It
always opens a new browser tab, and it has no link menu.

| Edit field | Meaning |
| --- | --- |
| Name (required) | The name of the character. Save stays off while it is blank |
| STR to CHA | The stored ability scores, from 1 to 30. They include the race increases and ability score improvements, and not the bonus of worn items. A change updates max HP, saves, checks, and AC at once |
| Saving throws, Skills, Armor, Weapon categories | The proficiency lists. Expertise stays on the sheet, and a skill removed here loses its expertise too |
| Other weapons, Tools, Languages | Named weapons, tools, and languages, one pill each |
| Max HP | The maximum without the raise of a spell such as Aid. A changed value overrides the calculated maximum, and lowers current HP to fit. An unchanged value leaves the maximum calculated, so it still grows with level and CON |
| Use class HP | Shows only after a typed maximum. Drops the typed value and goes back to the calculated maximum |
| Bonus HP (temporary) | Temporary points on top of the real HP. Damage drains them first, and healing never refills them. A typed amount stays after the spell that granted the old amount ends |
| Unarmored base AC | The unarmored baseline, normally 10 |

## Character summary card

The Sheet tab of the sidebar shows a summary card of the selected
character. It has what a GM reads during play:

- the name, the race, the HP bar, and the **Damage** and **Heal** controls
- the level line with AC, initiative, speed, passive Perception, the
  proficiency bonus, and XP
- the spell slot lines
- the level-up banner
- **Checks and saves**, a grid with a button for each plain ability check
  and each saving throw. A click rolls it through the dice tray. A solid dot
  marks a proficient save
- the counters of limited resources, such as Second Wind
- the Conditions block, with exhaustion
- the 18 skills, one line each with the bonus. A click rolls the skill

**Open full sheet** at the top of the card opens everything else. A Player
tab bound to a character shows the same card and the same button.

## Full sheet

**Open full sheet** at the top of the summary card opens the sheet the width
of the page, in the way the combat screen takes the page. The party row
menu (the three-dot button) has **Open full sheet** too, and the C key
opens and closes it in Play mode. With an empty party, the button hides
and the C key does nothing. The map, the party dock, and the sidebar hide
while it is open. The bar along the top has **Back to the map** and one
tab per party member. Left and Right move between the tabs, and Home and End
go to the first and last. **Back to the map** or Escape closes it and puts
focus back on the control that opened it. In a text field, such as the
inventory search, Escape clears the field and leaves the sheet open. A
switch to Build mode or a fight shows that mode, and the full sheet comes
back on the return to Play. At phone width the view bar at the bottom of
the screen hides while the full sheet is open.

The full sheet has four tabs.

| Tab | Contents |
| --- | --- |
| Character | The whole character sheet. On a page about 1,500 pixels wide or more, the skill list takes a third column beside the two section columns. See [Sheet contents](#sheet-contents) |
| Equipment | The nine equipment slots |
| Inventory | The item list |
| Spellbook | The spells that the character can learn, knows, and prepared. See [Spellbook tab](spellcasting.md#spellbook-tab) |

## Sheet contents

The top of the sheet shows the name, the race, and a tall HP bar the width
of the card, with the current and maximum HP above it. Under the bar, the
GM gets a **Damage** button, an amount field, and a **Heal** button. The
amount field sets how many HP each click moves. It starts at 1, and each
**Damage** or **Heal** press sets it back to 1. An empty field, or a number
below 1, disables both buttons. The level
line gives AC, initiative (**Init**), speed, passive Perception (**PP**),
the proficiency bonus (**Prof**), and XP. The tooltip of Init names the
disadvantage of exhaustion, as the initiative roll of a fight uses it.

A caster gets one line per spell level, such as "1st", then the pips, then
the free count, such as "3 of 4". A filled pip is a free slot. A spent pip is
a hollow ring, dimmed and struck through. A click on a pip spends or restores
a slot. Each line names its count for a screen reader and in its tooltip,
such as "Level 1 slots: 3 of 4 free".

While a character has a level to assign, an ability score improvement, or a
class feature choice left, a banner at the top of the sheet says so, such as
"Ready to level up: 1 level to assign." The GM's **Level up** button opens
the full sheet. For a pending level, it then opens **Assign a level**. For
an improvement or a feature choice, it moves focus to the **+2 ability** or
**Choose** button of the Progression block.
A Player tab shows the banner with no button. The party row of the character
shows a **Level up** mark at the same time.

The Character tab of the full sheet adds these items to the summary:

- the ability scores with their modifiers, which replace the quick-roll grid
- the six saving throws, with the bonus of each
- **Add pool** and the edit buttons of custom resource pools
- the Progression block, with the hit-dice pool
- the Features section, with one card for each class feature, race trait,
  and feat. A class feature with a claimed choice has a **Change** button
  for the GM. Cancel in its dialog keeps the current choice
- the castable spells

A dot in front of each save or skill shows how trained the character is.

| Dot | Training |
| --- | --- |
| Hollow | Untrained |
| Solid | Proficient |
| Ringed | Expertise, which doubles the proficiency bonus |

A key under passive Perception shows the solid and the ringed dot.

Some class features change these bonuses. Jack of All Trades (bard 2) adds
half the proficiency bonus, rounded down, to every check without
proficiency. Remarkable Athlete (Champion 7) adds half, rounded up, to a
STR, DEX, or CON check without proficiency. Aura of Protection (paladin 6)
adds the paladin's CHA modifier, at least +1, to its own saves, and the
GM applies the aura to allies. Diamond Soul (monk 14) makes every save
proficient, so every save shows the solid dot.

Passive Perception is 10 plus the Perception bonus. Compare it against a
hidden thing when nobody says they are looking.

A click on a save or a skill rolls it with a d20 and the whole bonus. The
roll goes through the dice tray, but the tray stays closed, and the dice and
the modifier that you set up in the tray stay as they were. The log shows
the parts of the number: the ability modifier, the proficiency or expertise,
and any condition chip that adds to the roll.

Guidance and Resistance add to one roll only. The first check or save that
they change removes their chip. In the Library, the spell form marks this
kind of spell with **One roll only**.

The DC is the **DC** field of the dice tray. Type a DC there once,
and each save or skill that you roll from the sheet reports success or
failure against it, in the toast and in the log, as in "against DC 13 from
the dice tray". The field keeps what you typed until you clear it. An attack
or a death save compares against its own target and leaves the field alone.
With the field blank,
nothing judges the roll, so compare the total against the DC that you have
in mind. The d20 mode of the dice tray applies, and the log names the die
that it dropped.

The Conditions block shows the chips and the held spell with its Drop
control. While the character is at 0 HP, it also shows the death-save
tracker with its Roll and Stabilize controls. The tracker shows the same
pips and words as the combat screen.

Expertise doubles the proficiency bonus for a skill. The Expertise features
of the Rogue and the Bard grant it. When such a feature unlocks, a prompt
offers the proficient skills.

The picks show in the class features list with a Change button. An
unclaimed grant waits in the Progression block as a pending feature choice
with a Choose button. The **Set expertise** button is a manual grant with
no maximum, for a subclass or homebrew feature that the class catalog does
not model. The button shows to the GM for any character with at least
one skill proficiency, and it offers only the proficient skills. The line
"No expertise chosen" shows only for a character with a class feature or a
feat that grants expertise.

## Creation and progression

Creation picks a class, a race, and a background, and offers the skill
choices of the class. The class list leaves out a skill that the race or the
background already gives, so an Acolyte Cleric picks two skills other than
Insight and Religion. A Half-Elf also picks two abilities other than CHA
that gain +1 each, and two skills of any kind (Skill Versatility). A
Dragonborn picks the damage type of its Draconic Ancestry and resists that
type. A Dwarf picks its tool proficiency from smith's tools, brewer's
supplies, and mason's tools. An Elf (the High Elf) picks one cantrip from the
wizard list. The cantrip joins the spellbook, casts with INT, and does not
count against a class cantrip limit, so a fighter elf casts it too. From these choices, the sheet assembles the proficiencies: saving
throws, skills, weapons, armor, tools, and languages. Every list stays
editable afterward. The Edit dialog of the character also changes the two
Half-Elf ability picks, the Dragonborn ancestry, and the High Elf cantrip,
and the scores move to match. A High Elf that forgets its race cantrip in
the Spellbook tab loses the pick, and the Edit dialog picks a new one.

These race traits change rolls by themselves:

| Trait | Race | Effect |
| --- | --- | --- |
| Lucky | Halfling | A natural 1 on an attack roll, an ability check, a saving throw, or a death save rolls again, and the new roll stands |
| Brave | Halfling | Advantage on a spell save against Frightened |
| Fey Ancestry | Elf, Half-Elf | Advantage on a spell save against Charmed |
| Dwarven Resilience | Dwarf | Resistance to poison damage, and advantage on a spell save that poisons or deals poison damage |
| Gnome Cunning | Gnome | Advantage on every INT, WIS, and CHA save against a spell |

The app applies Lucky to the weapon attacks, death saves, saves, and checks
that it rolls. A spell attack and a roll in the dice tray by hand still need
the reroll by hand. The save traits apply to the saves that a spell or a creature action asks
for, and to the save at the end of a turn that can end a spell's condition.
A creature action, such as a breath weapon, is not magic, so Gnome Cunning
does not help against it. A save that the GM calls at the table from the
sheet still needs the advantage set by hand. The remaining race traits are text on the sheet,
and the GM applies them: the Dragonborn Breath Weapon, Stonecunning,
Trance, Naturally Stealthy, Halfling
Nimbleness, Artificer's Lore, Tinker, Relentless Endurance,
Hellish Resistance, Infernal Legacy, and Extra Language. The app adds the
Savage Attacks die to a melee critical hit.

The class sets the hit die, and the class with its subclass sets the caster
type. Max HP comes from the hit die plus the CON modifier per level. The Hill
Dwarf (Dwarven Toughness) and the Tough feat add 1 and 2 HP per character
level. A Draconic Bloodline sorcerer adds 1 HP per sorcerer level.

Spell slots follow the 5e table. A multiclass character combines its
casting classes on the combined-caster-level table.

A character with no class still works. Its HP then follows a flat growth
curve, and it gains no proficiencies.

The total XP of a character follows the SRD table.

| Level | XP |
| --- | --- |
| 2 | 300 |
| 3 | 900 |
| 4 | 2,700 |
| 5 | 6,500 |
| 11 | 85,000 |
| 20 | 355,000 |

The sheet header shows the total against the start of the next level. A
character made at a higher level starts at the XP where that level begins.

Enough XP does not level a character with a class on its own. Each earned
level waits as a pending level. The GM assigns it to a class, either the
current class or a new one.

The proficiency bonus, cantrip damage, and the encounter budget follow the
assigned class levels. So a pending level does not raise any of them until the
GM assigns it. The roster reads "(Lv 4, +1 to assign)" and the sheet header
reads "Level 4, 1 level to assign" while that level waits.

An assignment does these things:

- It grows HP by the hit die of that class.
- It adds a hit die.
- It advances the spell slots. A new spell level arrives full, and a slot
  already spent stays spent.
- On an ability score improvement level, it leaves a pending choice: +2
  across one or two abilities, up to 20, or a feat by name.

Both choices can be undone from the same block. The feat list shows a
built-in feat that the character does not qualify for as disabled, and it
names the prerequisite. An example is Grappler for a STR 8 Wizard. The
prerequisite of a feat that you wrote in the library is display text only,
so you enforce it.

A class feature with choices, such as the Expertise of the Rogue, prompts
when its level is assigned. A choice with only one possible pick applies
with no prompt. A cancel keeps the grant pending, and the Choose button in
the Progression block offers it again.

The hit-dice pool can be spent. The Spend button in the Progression block
spends one die outside a rest, and it asks first, so a click in the middle
of a fight does not heal by mistake.

| Rest | Hit dice |
| --- | --- |
| Short rest | The Short rest dialog asks how many dice each hurt character spends. Each die heals the roll plus the CON modifier, and spending stops at full HP |
| Long rest | Restores half of the total hit dice, at least one, largest dice first. For example, Fighter 3 / Wizard 3 with every die spent gets three dice back |

## Fighting styles

The Fighting Style feature of the Fighter (level 1), the Paladin (level 2),
and the Ranger (level 2) waits in the Progression block as a pending feature
choice. Click **Choose** and pick one style. The class features list shows
the pick with a Change button. A character with the feature from two classes
takes a different style each time.

| Style | Classes | Effect in the app |
| --- | --- | --- |
| Archery | Fighter, Ranger | +2 to the attack roll of a ranged weapon |
| Defense | Fighter, Paladin, Ranger | +1 AC while the character wears body armor |
| Dueling | Fighter, Paladin, Ranger | +2 damage with a melee weapon in one hand, when no other weapon is in hand |
| Great Weapon Fighting | Fighter, Paladin | Each 1 or 2 on a damage die rolls again once, for a two-handed weapon or a versatile weapon swung in two hands |
| Protection | Fighter, Paladin | Text only. The GM applies the disadvantage by hand |
| Two-Weapon Fighting | Fighter, Ranger | The off-hand attack adds the ability modifier to damage |

The attack log line names Archery, and the hit line names Dueling and Great
Weapon Fighting.

## Disciple of Life

A Life Domain cleric adds 2 + the spell slot level to each target of a
healing spell of 1st level or higher, such as Cure Wounds or Healing Word.
An upcast uses the higher slot. The heal line in the log ends in
", Disciple of Life +N". A spell that rolls no healing dice (Lesser Restoration), a
revive, and a stabilize get no bonus. The class features list on the sheet
shows the feature from cleric level 1.

## Class feature pools


The app gives each character a resource pool for every class feature that
has a count of uses. The class levels and the ability scores set the size of
each pool, so you do not type it in. A new level adds its uses unspent, and a
class that the character no longer has takes its pool away.

| Pool | Class and level | Uses | Refills on |
| --- | --- | --- | --- |
| Second Wind | Fighter 1 | 1 | Short rest |
| Action Surge | Fighter 2 | 1, or 2 from level 17 | Short rest |
| Rage | Barbarian 1 | 2, then 3 at level 3, 4 at 6, 5 at 12, 6 at 17. No pool at 20, where rage has no limit | Long rest |
| Bardic Inspiration | Bard 1 | The CHA modifier, at least 1 | Long rest, or short rest from level 5 |
| Channel Divinity | Cleric 2, Paladin 3 | Cleric: 1, then 2 at level 6, 3 at 18. Paladin: 1. A character with both classes gets the larger count | Short rest |
| Divine Sense | Paladin 1 | 1 plus the CHA modifier | Long rest |
| Lay on Hands | Paladin 1 | 5 hit points for each paladin level | Long rest |
| Ki points | Monk 2 | The monk level | Short rest |
| Wild Shape | Druid 2 | 2. No pool at 20, where Wild Shape has no limit | Short rest |
| Sorcery points | Sorcerer 2 | The sorcerer level | Long rest. From level 20, a short rest also restores 4 points (Sorcerous Restoration) |
| Arcane Recovery | Wizard 1 | 1 | Long rest |

## Custom pools

The GM can add a pool for any count of uses that the class list does not
give, such as the charges of a wand. Click **Add pool** below the resource
list of the sheet, and set the name, the number of uses, and **Refills on**.
A **Long rest** pool refills on a long rest, a **Short rest** pool refills on
either rest, and a **No rest** pool refills only when the GM restores it with
the plus button. Each row shows its rest in brackets. The pencil button edits
a custom pool, and the bin button removes it. A class feature pool has no
edit button, because the class levels set its size and its rest.

## Subclasses


A class can take a subclass from its subclass level.

| Subclass level | Classes |
| --- | --- |
| 1 | Cleric, Sorcerer, Warlock |
| 2 | Druid, Wizard |
| 3 | Barbarian, Bard, Fighter, Monk, Paladin, Ranger, Rogue |

The Progression block shows a Choose button for each class at that level,
and a Change button after the pick. The assignment of the subclass level
also asks for the pick. Only the GM can set a subclass.

The list offers the SRD subclass of each class. The Fighter also offers the
Eldritch Knight, and the Rogue also offers the Arcane Trickster.

| List item | Effect |
| --- | --- |
| A listed subclass | Stores that subclass and applies its rules |
| Other… | Stores any typed name. A typed name that matches a listed subclass stores as the listed name. A name that is not on the list has no rules effect |
| None | Clears the subclass |

The Eldritch Knight and the Arcane Trickster cast spells. Each one learns
from the wizard list with INT, as a known caster with no rituals. The slots
follow the third-caster table below, and a spell can be no higher than the
top slot level.

| Class level | Slots | Top spell level |
| --- | --- | --- |
| 3 | 2 × 1st | 1st |
| 4 to 6 | 3 × 1st | 1st |
| 7 to 9 | 4 × 1st, 2 × 2nd | 2nd |
| 10 to 12 | 4 × 1st, 3 × 2nd | 2nd |
| 13 to 15 | 4 × 1st, 3 × 2nd, 2 × 3rd | 3rd |
| 16 to 18 | 4 × 1st, 3 × 2nd, 3 × 3rd | 3rd |
| 19 to 20 | 4 × 1st, 3 × 2nd, 3 × 3rd, 1 × 4th | 4th |

| Subclass | Cantrips |
| --- | --- |
| Eldritch Knight | 2, and 3 from level 10 |
| Arcane Trickster | 3, and 4 from level 10 |

In a multiclass, each of these subclasses adds a third of its class level
to the combined caster level. A class with no slots yet at its own level
does not join the combined table. So a Fighter 4 (Eldritch Knight) /
Paladin 1 keeps the Eldritch Knight slots.

A change away from a casting subclass removes its slots, and it removes the
spells that the character learned under that class. A later change back
gives full slots. While a class has a subclass on its subclass level, that
level cannot move to a new class.

The Spells block of the character sheet warns when a spell list breaks a
subclass rule. The warning does not block the list, so a GM can allow it.

- The spell schools of each subclass. The Eldritch Knight uses abjuration
  and evocation, and the Arcane Trickster uses enchantment and illusion.
  The spells learned at class levels 3, 8, 14, and 20 can come from any
  school.
- The number of leveled spells that each subclass knows: 3 at class level
  3, 4 at level 4, and 13 at level 20. Only the spells learned under the
  subclass count, so the wizard spells of a Fighter (Eldritch Knight) /
  Wizard do not.
- Mage Hand as one of the Arcane Trickster cantrips.

The same block warns when a Bard, Sorcerer, Warlock, or Ranger knows more
leveled spells than its class table allows, for example 7 for a Bard 4 or 2
for a Ranger 2. Only the spells learned under that class count. A
warlock's Mystic Arcanum spells of 6th level and up do not count. The
warning does not block the list either.

## Eldritch invocations

A warlock picks its eldritch invocations and its pact boon when it gains
a warlock level in the Progression block. Only the GM can pick either one.
The level-up asks for the pact boon at warlock level 3, and for the new
invocations at each level that raises the count. It then offers one
optional swap of a known invocation for another that qualifies. A pick
that the GM cancels stays pending, and the **Warlock choices pending** row
asks for it again, with no swap. The Invocations row shows how many
invocations the warlock has and how many its level allows. The **GM edit**
buttons set the boon and the invocations freely, with no swap limit, and
list only the invocations that the warlock qualifies for. An invocation qualifies when the warlock level is high enough, the
warlock knows the cantrip that it names, and the warlock has the pact boon
that it names. The Pact boon row appears from warlock level 3. The
Invocation rules list under the rows shows what each picked invocation does.

| Warlock level | Invocations |
| --- | --- |
| 2 to 4 | 2 |
| 5 to 6 | 3 |
| 7 to 8 | 4 |
| 9 to 11 | 5 |
| 12 to 14 | 6 |
| 15 to 17 | 7 |
| 18 to 20 | 8 |

| Invocation | Effect in the app |
| --- | --- |
| Agonizing Blast | Adds the CHA modifier to the damage of each Eldritch Blast beam that hits |
| Eldritch Spear | Sets the range of Eldritch Blast to 300 feet |
| Repelling Blast | Adds a log line for each creature that an Eldritch Blast hits, with how far it can be pushed. The push has no size limit |
| An at-will spell, such as Armor of Shadows | The spell casts with no slot, at its own level. An invocation that limits the spell to the warlock offers only the warlock as a target, and one with no material drops the component. If the spellbook also has the spell, the app first asks **How to cast**: at will, or with a spell slot. The slot cast works as a usual cast, so it can target others and use a higher slot |
| A once-per-rest spell, such as Thief of Five Fates | The spell casts with a pact slot, and then it refuses until a long rest. The slot picker offers only the pact slot level, and the cast refuses when no pact slot is left. If the spellbook also has the spell, the cast uses the spellbook and keeps the invocation for later |
| Beguiling Influence | Adds the Deception and Persuasion skills. A change that removes the invocation removes the skills, except a skill that another grant also gives. A warlock that drops below 2nd level loses the skills, and gets them back at 2nd level |
| Book of Ancient Secrets | Casts the rituals in the Book of Shadows as rituals. See [Pact of the Tome](#pact-of-the-tome) |
| Thirsting Blade | One Attack action buys two swings with the marked pact weapon. A first swing with another weapon ends the Attack action, and the second swing refuses any weapon but the pact weapon. It does not add to Extra Attack from another class, so a fighter 5 / warlock 5 still swings twice with any weapon |
| Lifedrinker | Each hit with the pact weapon adds necrotic damage equal to the CHA modifier, at least 1. A critical hit does not double it. The damage line of the log names it, as in `, Lifedrinker +4 necrotic` |
| Any other invocation, such as Devil's Sight | Text in the rules list only |

The spells that the invocations cast list on the character sheet and in
combat. A spell that the spellbook does not have goes in its own
Invocations group on the sheet. A once-per-rest spell in that group shows
struck through while it is spent, and its tooltip says "spent" or
"available". A cast through an invocation uses the
warlock save DC and attack bonus, and the log names the invocation, as in
"Wren casts Mage Armor (Armor of Shadows)."

A Pact of the Blade warlock marks its pact weapon in the Inventory tab. Each
weapon or bow row has a sword button, labeled **Make (weapon) the pact
weapon**, that marks it, and the same button clears the mark. The marked row shows a
**Pact weapon** badge. One weapon at a time is the pact weapon, and the mark
goes away when the weapon leaves the inventory. Thirsting Blade and Lifedrinker
read the mark.

The app does not enforce these invocation rules, so you enforce them:

- The creature types of Chains of Carceri, and its limit of one cast on
  each creature per long rest.
- The push of Repelling Blast. The board does not move a token by feet,
  so you move the token.
- The ritual casting of a warlock with Book of Ancient Secrets. The app
  offers the ritual box for a ritual in the Book of Shadows only, but a
  ritual that the warlock also knows as a warlock spell casts with a slot.
- How the Pact of the Blade summons the pact weapon, and the familiar of the
  Pact of the Chain with the invocations that use it. The pact weapon does not
  count as magical against resistance to nonmagical damage.

## Pact of the Tome

A warlock with the Pact of the Tome keeps a Book of Shadows. The level-up
that picks the boon asks for three cantrips from the list of any class,
and the **Book of Shadows cantrips** row in the Progression block changes
them. The book cantrips join the spellbook as warlock spells, so they use
CHA and the warlock save DC. They do not count against the cantrip limit,
so the Spellbook tab reads, for example, "Cantrips 5/5" for two class
cantrips and three book cantrips.

A change of the pact boon away from the Pact of the Tome removes the Book of
Shadows. Its cantrips leave the spellbook, and a cantrip that the warlock
knew from a class before the book stays. To keep a book cantrip, forget it
in the Spellbook tab and learn it again as a class cantrip before you change
the boon.

The Book of Ancient Secrets invocation adds rituals to the book. The pick
asks for two 1st-level rituals from the list of any class. To copy more
rituals later, click **Add ritual** on the **Book rituals** row. The list
offers rituals up to half the warlock level, rounded up. A ritual in the
book lists with the other spells on the sheet, and it casts only as a
ritual, with no slot and ten minutes more. The GM decides when the warlock
finds a ritual to copy, and the app does not charge the gold or the time
of the copy. A warlock who loses the invocation loses the rituals too, so
the invocation picked again asks for two new rituals.

## Mystic Arcanum

At warlock levels 11, 13, 15, and 17, the level-up asks for one warlock spell
of 6th, 7th, 8th, and 9th level. The list offers the warlock spells of that
level in the library. A level left at None stays pending, and the **Warlock
choices pending** row asks for it again. The **Mystic Arcanum** row in the
Progression block lists the picks, and its **GM edit** button changes them.

An arcanum spell casts once per long rest at its own level with no spell
slot. It lists in a Mystic Arcanum group on the character sheet, and with
the other spells in combat. While it is spent, its chip shows struck through, and a cast
refuses until a long rest. If the spellbook also has the spell, the app
first asks **How to cast**: the arcanum with no slot, or a spell slot. The
log names the feature, as in "Wren casts Circle of Death (Mystic Arcanum)."

## Inventory and equipment

The Equipment tab shows nine slot cards around a plate with the
character's name and AC: Helmet, Armor, Gloves, Greaves, Main hand, Off
hand, Ranged, Ring 1, and Ring 2. A card shows the item's name and one
short stat line, such as "AC 17, heavy" or "1d8 slashing". Click a card to
open its picker. The picker lists **Empty** and every item that the slot
accepts, each with its full details, and **Equip** puts the chosen item in
the slot. 5e armor has no Helmet, Gloves, or Greaves
slot, so those three are a house rule. The item form marks their types
with "(house rule)", and a note under the AC row says so too.

| Slot | Accepts |
| --- | --- |
| Helmet | helmet |
| Armor | armor |
| Gloves | gloves |
| Greaves | greaves |
| Main hand | weapon |
| Off hand | shield or weapon |
| Ranged | bow |
| Ring 1, Ring 2 | ring |

One item fills as many slots as its quantity. So a single ring goes on one
hand, and a pair of daggers can fill both hands. A two-handed weapon in the
main hand empties the off hand. The Off hand card reads "Both hands on" the weapon, and it stays closed
until the weapon comes out of the main hand.

The **Coins** row at the top of the Inventory tab has one field for each
5e coin: platinum (pp), gold (gp), electrum (ep), silver (sp), and copper
(cp). Type a count and press Enter or leave the field to save it. The GM and
the player of a bound tab can change the counts, and a spectator sees one
line such as "25 gp, 7 sp". A save that keeps gold as a "Gold (gp)" item
moves that item into the gold field when it loads.

The Inventory tab also has a search box over names and descriptions, a type
filter, and one collapsible heading per item type. Under each heading, every
item is a tile with its name, one short stat line, a badge such as "x41" for
a stack, and an "Equipped" mark for an item in a slot. Click a tile to show
the item in the detail pane, which has its full effects, its description,
and the edit, give, count, use, and discard controls. On a wide screen the
pane sits beside the tiles, and on a narrow one it sits under them.

| Item field | Values |
| --- | --- |
| Type | gear, weapon, armor, helmet, gloves, greaves, shield, bow, ring, or consumable. Gear and consumables cannot be equipped |
| Description | Free text |
| Damage roll | Structured dice terms: a base roll plus optional permanent riders |
| Category | simple, martial, or none for a natural weapon such as a bite |
| Kind | melee (STR) or ranged (DEX) |
| Properties | The 5e property flags: finesse, versatile, two-handed, light, heavy, reach, thrown, ammunition, and loading |
| Range | Normal and long range in feet, for a ranged or thrown weapon. A blank or unreadable field takes 80/320 for a ranged weapon and 20/60 for a melee weapon. The long range never saves shorter than the normal range |
| Two-handed damage | The other dice of a versatile weapon |
| Status effects | Tags that the weapon inflicts, for example burning or poisoned |
| Magic | For a weapon: tick **Magical weapon** so that resistance to nonmagical weapon damage does not apply |
| Light | For gear: tick **Sheds light** for a torch or a lantern, so the group that carries it sees in the dark (see the sight table) |
| Weight class | For body armor: light, medium, or heavy |
| Base AC | For body armor |
| Min STR | For body armor: the Strength score that it needs. 0 means none |
| Stealth | For body armor: tick it to give the wearer disadvantage on Stealth |
| AC bonus | A flat bonus on any other item that can be equipped. A shield uses this field too, and it starts at +2 |
| Ability buff | For example +2 STR, applied while the item is equipped |
| Heals when drunk | For a consumable: the heal dice, as a count, a die size, and a flat bonus. A count of 0 means the item heals nothing. A potion preset fills it |

Only the GM adds an item. A player uses, gives away, and discards what the
character carries. A new or given item joins an existing stack only when its
name, type, notes, and every other field match. Otherwise it gets a row of its
own, so a renamed "Dagger +1" and a plain Dagger stay apart.

| Control | Shows for | What it does |
| --- | --- | --- |
| Use one | A consumable | Uses one charge, down to the last one. A consumable with heal dice asks who drinks it first (see below) |
| Drop one | Any other stacked item | Removes one from the stack |
| Add or remove (plus) | Every item, for the GM | Opens an **Amount** field under the row. **Add** puts that many on the stack, and the log records a pickup. **Remove** takes that many off, at most the whole stack, and the log records a discard |
| Discard | Every item | Removes the whole stack. Asks first when the stack has more than one item |

A consumable with heal dice heals when a character uses it. **Use one** opens a
dialog that asks who drinks it. The character who carries it is first,
and any other party character can take it, so a character can pour a
potion into a downed ally. The tray rolls the heal with no target, and a
heal above 0 HP ends the dying state. The log and a toast show the heal and
the new HP, so the result shows on the full sheet too, where the tray is
hidden. A dead character cannot take a
potion, and the potion stays on the stack. In a fight, on the turn of the
character who carries it, a potion costs the action. The app does not
check that the two characters stand on the same tile.

| Potion | Heal |
| --- | --- |
| Potion of Healing | 2d4 + 2 |
| Potion of Greater Healing | 4d4 + 4 |
| Potion of Superior Healing | 8d4 + 8 |
| Potion of Supreme Healing | 10d4 + 20 |

The heal dice belong to the item, so a renamed potion still heals. To make
a custom healing item, such as a Troll Draught that heals 3d6, add a
consumable and set **Heals when drunk**. A consumable with no heal dice is a
plain consumable, and **Use one** only takes it off the stack. A potion from
an older save that has no heal dice gets them on load when its name matches
one of the potions above.

An edit keeps the item equipped, because it is the same item. A type change
that its slot cannot accept takes the item off. When the last of a stack is
removed, the item comes off.
