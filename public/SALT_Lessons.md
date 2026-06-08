# SALT Self-Paced Lessons

## Introduction

**SALT**, the **Secretion and Absorption Learning Tool** (https://julian-salt.netlify.app/) is an app for exploring and discovering mechanisms of epithelial transport physiology. This lesson guide is a series of small experiments that will help you discover and learn what a transporter layout can and cannot do.

Before starting these lessons, you should be familiar with basic cell biology and membrane potential fundamentals. You are ***not*** assumed to be familiar with epithelial polarity, epithelial absorption/secretion mechanisms, paracellular transport, or epithelial transporters.

## Minimal Starting Conventions

You need four conventions to begin:

1. An epithelial cell has two different membrane surfaces.
   - The **apical membrane** faces the **lumen**.
   - The **basolateral membrane** faces the **blood side** (**interstitial fluid side**).
2. **Absorption** means the net movement of water or a solute from the lumen to the blood side.
3. **Secretion** means the net movement of water or a solute from the blood side to the lumen.
4. In the Results frame, the **Mechanism** tab is the main place to look for transporter actions and pathway roles. The **Fluxes** and **Concentrations** tabs remain available for movement, gradient, and quantitative checks.
   - **Positive flux = absorption = movement toward blood**
   - **Negative flux = secretion = movement toward lumen**

You will learn other conventions as experiments require them.

---

# Lesson 1: Simple Na⁺ absorption and K⁺ secretion mechanisms

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Distinguish concentration from flux.
- Explain why epithelial polarity matters.
- Describe how Na⁺/K⁺-ATPase changes the Na⁺ and K⁺ gradient state of the cell.
- Explain why ENaC plus Na⁺/K⁺-ATPase can produce Na⁺ absorption.
- Distinguish transepithelial potential from membrane potential.
- Use an intracellular imbalance as a clue that a layout may be incomplete.

## Setup

1. Set **Tissue** to **All Transporters** (the default mode).
2. Set the **Paracellular Pathway** to **Barrier**  (the default mode).
3. Keep default concentrations (the default mode in **Settings**).

---

## Experiment 1A: Begin With No Transporters

In the Results frame (the output displays on the right side of the app), look at:

- **Mechanism**: This tab shows the transporter layout, mechanism arrows, and qualitative pathway summary.
- **Fluxes**: This tab displays movement across the apical membrane, basolateral membrane, paracellular pathway, and net epithelium for all solutes modeled in SALT. Note that there are three graph groups: 1) **Inorganic Ions**, 2) **Nutrients**, and 3) **Organic Ions**. The Nutrients graph and Organic Ions graph remain hidden unless there are relevant fluxes, so they are not currently visible.
- **Concentrations**: This tab displays solute concentrations in the apical bulk ECF, apical surface ECF, ICF, basolateral surface ECF, and basolateral bulk ECF. The graph shows the major solutes.

Focus on the Na⁺ and K⁺ concentrations and whether there are any fluxes.

> [!NOTE]
> **Result:** No transmembrane Na⁺ or K⁺ gradients, no fluxes

>[!TIP]
>Insight 1A: Equal ICF and ECF concentrations produce no transmembrane gradient and no flux.


## Experiment 1B: Na⁺/K⁺-ATPase

From the **Basolateral Membrane** menu, select **Add Transporter** and under **Pumps**, add **Na⁺/K⁺-ATPase**.

```
Na⁺-K⁺-ATPase
(Barrier paracellular pathway)
```

In the Results frame, look again at:

- Na⁺ and K⁺ fluxes and concentrations

> [!NOTE]
> **Result:** Gradients established for Na⁺ (145 mmol/L ECF, 12 mmol/L ICF) and K⁺ (4.0 mmol/L ECF, 140 mmol/L ICF), but no fluxes. No cell imbalances.

> [!TIP]
> Insight 1B: Na⁺/K⁺-ATPase establishes Na⁺ and K⁺ gradients but does not by itself create epithelial flux.

## Experiment 1C: ENaC

### Part 1

Keep basolateral Na⁺/K⁺-ATPase in place.

From the **Apical Membrane** menu, select **Add Transporter**, then under **Channels**, add **ENaC** (epithelial Na⁺ channel).

```
ENaC
Na⁺-K⁺-ATPase
(Barrier paracellular pathway)
```

In the Results frame, look again at:

- Na⁺ and K⁺ fluxes and concentrations

Remember:

>positive flux = absorption = movement toward blood
>negative flux = secretion = movement toward lumen


> [!NOTE]
> **Result:** Net Na⁺ absorption (0.50).

> [!TIP]
> Insight 1C: Apical ENaC plus basolateral Na⁺/K⁺-ATPase creates net Na⁺ absorption.

---

### Part 2

In the Results Snapshot, examine **TEP**. For more detail, open the **Details** tab and look under **Charge & Polarity**.

You already know membrane potential from excitable cells. **Transepithelial potential**, or **TEP**, is different. While membrane potential is the voltage across one cell membrane, TEP is the voltage across the entire epithelial layer, comparing the lumen side with the blood/interstitial side.

Note that SALT reports TEP qualitatively. Treat it as an epithelial-scale electrical tendency rather than an exact voltage.

> [!NOTE]
> **Result:** Moderate negative TEP (-0.5 charge units)

> [!TIP]
> Insight 1D: Electrogenic Na⁺ absorption creates a transepithelial potential distinct from membrane potential.

### Part 3

Note that there is a **Cell balance** card in the Results Snapshot. It should now indicate intracellular K⁺ accumulation. To examine this tendency in more detail, open the **Concentrations** tab and look at the **Intracellular Balance** table.
> [!NOTE]
> **Result:** Intracellular K⁺ accumulation (0.33)

> [!TIP]
> Insight 1E: A layout can produce the target epithelial flux while still creating an intracellular imbalance.

## Mini-Challenge 1: Kir

From a blank canvas, use **Kir** (K⁺ delayed rectifier channel) to generate K⁺ secretion. This layout resembles a simplified **collecting duct principal cell** mechanism.

Constraints:

- Use the Barrier paracellular pathway.
- Use only Na⁺/K⁺-ATPase and Kir.

Targets:

- Establish a pump-supported Na⁺/K⁺ gradient state.
- Produce negative net K⁺ flux.
- Identify any TEP tendency.
- Identify any intracellular imbalance clue.

> [!NOTE]
> **Solution**:
> ````
> Basolateral Na⁺/K⁺-ATPase
> Apical Kir
> (Barrier paracellular pathway)
> ````
> Result: K⁺ secretion (-0.29). Na⁺ depletion (-0.44).

> [!TIP]
> Insight Mini-Challenge 1: Apical Kir plus Na⁺/K⁺-ATPase can produce K⁺ secretion, but creates Na+ imbalance.

---

# Lesson 2: Glucose and phosphate absorption

**Estimated active time:** 20 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Predict passive glucose movement from glucose gradients and transporter placement.
- Explain why GLUT can move glucose down its gradient but cannot drive glucose uphill.
- Explain why glucose uptake against its gradient requires an energy source.
- Describe how SGLT uses the Na⁺ gradient to support glucose uptake.
- Explain how Na⁺/K⁺-ATPase indirectly supports glucose absorption.
- Build and interpret a complete epithelial absorption layout with apical uptake, basolateral exit, and gradient support.
- Apply this logic to phosphate absorption using NaPi and Pi Facilitator.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 2A: Inspect the Glucose Gradient

Open the **Concentrations** tab, look at the solute concentration graph, and find glucose.

Compare:

- Apical ECF glucose
- ICF glucose
- Basolateral ECF glucose

> [!NOTE]
> **Result:** ECF glucose concentration (5) > ICF glucose concentration (1)

> [!TIP]
> Insight 2A: Glucose has a concentration gradient before any glucose transporter is added.

## Experiment 2B: GLUT

In this experiment, you will test the passive glucose transporter **GLUT**, which can be added from *Facilitators* in the transporter menus.
```
Apical GLUT
(Barrier paracellular pathway)
```
Look at glucose in the **Mechanism** tab first, then check the **Fluxes** tab if you want the flux values.

> [!NOTE]
> **Result:** Positive apical glucose flux (1.14), increased ICF glucose concentration (2.14)

> [!TIP]
> Insight 2B: Apical GLUT allows passive glucose movement into the cell when the glucose gradient favors entry.

## Experiment 2C: Basolateral GLUT

Remove the apical GLUT and prepare the following layout:
```
Basolateral GLUT
(Barrier paracellular pathway)
```
Observe glucose flux again.

> [!NOTE]
> **Result:** Identical to preceding experiment, but reversed flux direction.
> Negative basolateral glucose flux (-1.14), increased ICF glucose concentration (2.14)

> [!TIP]
> Insight 2C: Basolateral GLUT can provide a glucose pathway, but placement determines which compartment it connects to the cell.

## Experiment 2D: SGLT 

GLUT can provide a passive glucose pathway, with the net flux direction depending on the glucose gradient. Therefore, with the current ECF and ICF glucose concentrations, net glucose flux is into the cell regardless of which membrane GLUT is placed on.

Assume that the goal is to increase the intracellular glucose concentration *above* the ECF glucose concentration. This would require uphill glucose transport against its concentration gradient.

This can be achieved with **SGLT** (sodium-glucose-linked transporter, or sodium-glucose cotransporter), which can be added from *Cotransporters* in the transporter menus. This layout models **small intestinal absorptive cells** and **renal proximal tubule cells**, with apical Na⁺-coupled glucose uptake, basolateral glucose exit, and Na⁺ gradient support.

Keep the transporter layout from the preceding experiment, but add apical SGLT:

```
Apical SGLT
Basolateral GLUT
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```
Observe:

Glucose fluxes across the apical and basolateral membranes and net epithelial glucose flux.
Na⁺ fluxes across the apical and basolateral membranes and net epithelial Na⁺ flux.

> [!NOTE]
> **Result:** Glucose absorption (0.35), Na absorption (0.35). K⁺ accumulation (0.23) and glucose accumulation (6.49). ICF glucose is increased (7.49)

> [!TIP]
> Insight 2D: SGLT can support glucose uptake against its concentration gradient when coupled to Na⁺ movement and supported by Na⁺/K⁺-ATPase.

## Experiment 2E: Remove the Na⁺/K⁺-ATPase

Now test whether the Na⁺ gradient is actually required for net glucose absorption.

Remove the basolateral Na⁺/K⁺-ATPase and prepare the following layout:

```
Apical SGLT
Basolateral GLUT
(Barrier paracellular pathway)
```
Observe:

Cell Gradient State
Na⁺ flux
Glucose flux
Net epithelial glucose flux

> [!NOTE]
> **Result:** Reverts to conditions of Experiment 2C (GLUT without SGLT or Na/K pump). Negative basolateral glucose flux (-1.14), ICF glucose concentration increased above default (2.14).

> [!TIP]
> Insight 2E: Removing Na⁺/K⁺-ATPase removes the pump-supported Na⁺ gradient state needed for SGLT-dependent glucose absorption.

## Mini-Challenge 2: NaPi and Pi facilitator

You have discovered how glucose absorption can use secondary active transport: Na⁺/K⁺-ATPase maintains a Na⁺ gradient, and SGLT uses that Na⁺ gradient to support glucose uptake.

Now apply the same logic to a different solute: inorganic phosphate, Pi.

In the default SALT concentrations, ICF Pi and ECF Pi are equal. Therefore, there is not a Pi concentration gradient that can produce passive Pi uptake.

Can you build a layout that produces **net epithelial Pi absorption**? This layout is a simplified model of **proximal tubule phosphate absorption**.

Constraints

- Use only the following three transporters:
  - **Na⁺/K⁺-ATPase**
  - **NaPi 2:1:** sodium-phosphate symporter, which co-transports 2 Na⁺ and 1 phosphate
  - **Pi facilitator:** facilitated Pi transporter
- Keep the default ECF concentrations.
- Keep the paracellular pathway set to **Barrier**.

> [!NOTE]
> **Solution**:
>
> ````
> Apical NaPi 2:1
> Basolateral Pi facilitator
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway)
> ````
> **Result:** Pi absorption (0.30), Na⁺ absorption (0.60). K⁺ accumulation (0.40).

> [!TIP]
> Insight Mini-Challenge 2: The same Na⁺-linked uptake logic can be transferred to phosphate using NaPi and a basolateral Pi exit pathway.

## Reflection

Compare the phosphate layout with the glucose layout.

| Functional role | Glucose absorption | Phosphate absorption |
|---|---|---|
| Apical Na⁺-linked uptake | SGLT | NaPi 2:1 |
| Na⁺ gradient support | Na⁺/K⁺-ATPase | Na⁺/K⁺-ATPase |
| Basolateral exit | GLUT | Pi facilitator |

The important transfer idea is:

> Different solutes can use the same epithelial logic: apical Na⁺-linked uptake, Na⁺ gradient support, and a route for completed epithelial absorption.


---
# Lesson 3: Balancing ion transport
**Estimated active time:** 10 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Explain why producing the target epithelial flux does not necessarily mean the cell is balanced.
- Use intracellular imbalance tendencies as clues for missing supporting pathways.
- Distinguish K⁺ recycling from K⁺ secretion.
- Explain how a basolateral K⁺ pathway can help balance K⁺ entering through Na⁺/K⁺-ATPase.
- Explain why K⁺ secretion can create a need for Na⁺ entry or Na⁺ replacement.
- Build and interpret a more complete ion transport layout that includes target flux and supporting/recycling flux.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 3A: Rebuild Simple Na⁺ Absorption

Build the simple Na⁺ absorption layout from Lesson 1:

```
Basolateral Na⁺/K⁺-ATPase
Apical ENaC
(Barrier paracellular pathway)
```

This layout produced Na⁺ absorption, but it also produced intracellular K⁺ accumulation.

This raises an important epithelial transport question: How can a transporter layout produce epithelial Na⁺ absorption without accumulating intracellular K⁺?

In this lesson, you will use intracellular imbalance clues to identify missing supporting pathways. The goal is not simply to move one solute in the desired direction. The goal is to build a layout that makes physiological sense for the cell *and* the epithelial layer.

> [!NOTE]
> **Result:** This is the same layout as in lesson 1, showing Na⁺ absorption (0.50), but students should note in particular the intracellular imbalance showing K⁺ accumulation (0.333).

> [!TIP]
> Insight 3A: A layout can absorb Na⁺ while still producing intracellular K⁺ accumulation.

## Experiment 3B: Enable K⁺ Recycling

Keep the layout from above and add the **Kir** potassium channel to the **basolateral membrane**.
```
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```
Observe:

- Cell balance to check for intracellular K⁺ accumulation
- K⁺ fluxes
- Na⁺ fluxes
- TEP

> [!NOTE]
> **Result:** Na⁺ flux is the same as in experiment 3A, but now there is positive basolateral K⁺ flux (0.33), and the cell is balanced (no accumulation).

> [!TIP]
> Insight 3B: Basolateral Kir can reduce K⁺ accumulation by providing a K⁺ recycling pathway.

## Experiment 3C: Compare Basolateral and Apical Kir

Keep the layout from the preceding experiment, but switch Kir to the apical membrane:
```
Apical ENaC
Apical Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```
Now compare two versions of the layout. For each version, observe:

- Cell balance to check for intracellular K⁺ accumulation
- K⁺ fluxes
- Na⁺ fluxes

> [!NOTE]
> **Result:** Na⁺ flux is the same as in experiment 3A and 3B, but now there is negative apical K⁺ flux (-0.29).

> [!TIP]
> Insight 3C: Kir placement changes epithelial interpretation: basolateral Kir supports recycling, while apical Kir supports K⁺ secretion.

## Mini-Challenge 3: Fix the Glucose Absorption Imbalance

In Lesson 2, you built a glucose absorption layout:

```
Apical SGLT
Basolateral GLUT
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```
This layout can produce epithelial glucose absorption. However, Na⁺/K⁺-ATPase also brings K⁺ into the cell. That means the glucose absorption pathway may have the same kind of K⁺ imbalance you observed in Na⁺ absorption.

Your task is to make the glucose absorption layout more complete.

**Challenge**

Build the glucose absorption layout from Lesson 2, then add one transporter to reduce or prevent intracellular K⁺ accumulation while preserving glucose absorption.

**Constraints**

- Keep default settings for **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).
- Begin with:

```
Apical SGLT
Basolateral GLUT
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```

Then add only one additional transporter.

**Targets**

Your final layout should:

- maintain net epithelial glucose absorption,
- maintain Na⁺-linked glucose uptake through SGLT,
- reduce intracellular K⁺ accumulation.

> [!NOTE]
> **Solution**:
>
> ````
> Apical SGLT
> Basolateral GLUT
> Basolateral Na⁺/K⁺-ATPase
> Basolateral Kir
> (Barrier paracellular pathway)
> ````
> **Result:** Glucose accumulation (6.49).
>
> The alternative layout solution with apical Kir also reduces K⁺ accumulation, but it shifts the layout toward K⁺ secretion. That is a useful comparison, but it is not the best answer if the goal is K⁺ recycling while preserving a glucose absorption phenotype.

> [!TIP]
> Insight Mini-Challenge 3: K⁺ recycling can make glucose absorption more complete without changing the target glucose flux.

---
# Lesson 4: Water movement

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Explain why solute absorption can create or support an osmotic tendency for water absorption.
- Explain why solute movement alone does not guarantee water movement.
- Identify AQP as a water pathway.
- Explain why transcellular water movement may require water permeability on both apical and basolateral membranes.
- Distinguish the solute transport mechanism from the water transport pathway.
- Predict how disrupting solute absorption or water permeability will affect Net Water Flux.

## Starting Question

In Lessons 1–3, you learned that epithelial transport often requires more than a target flux. A layout may also need supporting pathways, such as K⁺ recycling, to make the Cell balance more physiologically coherent.

Now you will ask a new question: If a solute is absorbed across an epithelium, will water automatically follow?

The answer depends on two requirements:

> Water movement requires an osmotic tendency plus water permeability

Solute movement can create or support the osmotic tendency. However, cell membranes are inherently impermeable to water. Water permeability across a membrane is provided by water channels called aquaporins (AQP).

## Setup

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 4A: Requirements for Water Movement

Build the balanced Na⁺ absorption layout from Lesson 3B:

```text
Apical ENaC
Basolateral Na⁺/K⁺-ATPase
Basolateral Kir
(Barrier paracellular pathway)
```

The water flux card in the Results Snapshot frame summarizes the osmotic pull across the epithelium and the net water flux. More detailed results are in the **Details** tab under **Water Movement**.

> [!NOTE]
>
> **Result:** There is a "weak" osmotic pull toward the blood (0.3) but no water flux. Other results are as in experiment 3B: Na⁺ absorption (0.50), basolateral K⁺ flux (0.33), cell balance.

> [!TIP]
> Insight 4A: Solute absorption can create osmotic pull, but osmotic pull alone does not produce water flux.

## Experiment 4B: Apical AQP

Keep the same solute absorption layout as the preceding experiment, but add **apical AQP**.

```text
Apical AQP
Apical ENaC
Basolateral Na⁺/K⁺-ATPase
Basolateral Kir
(Barrier paracellular pathway)
```

Observe:

- Net epithelial Na⁺ flux
- Cell balance
- Osmotic pull and water flux

The water flux card in the Results Snapshot frame summarizes the osmotic pull across the epithelium and the net water flux. More detailed results are in the **Details** tab under **Water Movement**.

> [!NOTE]
> **Result:** There is no change from the above results.

> [!TIP]
> Insight 4B: Apical AQP alone does not create a complete transcellular water pathway.

## Experiment 4C: Basolateral AQP

Keep the same solute absorption layout as the preceding experiment, but add **basolateral AQP** so that you have AQP on both cell surfaces.

```text
Apical AQP
Apical ENaC
Basolateral AQP
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```

Observe:

- Net epithelial Na⁺ flux
- Cell balance
- Osmotic pull and water flux

The water flux card in the Results Snapshot frame summarizes the osmotic pull across the epithelium and the net water flux. More detailed results are in the **Details** tab under **Water Movement**.

> [!NOTE]
> **Result:** Water flux toward blood (0.3). Otherwise no changes from the above results.

> [!TIP]
> Insight 4C: AQP on both membranes allows osmotic pull to become net epithelial water flux.

## Experiment 4D: Remove the Solute Absorption Driver

Keep AQP on both membranes.

Now remove **ENaC** from the apical membrane, giving you the following layout:

```
Apical AQP
Basolateral AQP
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway)
```

Observe:

- Net epithelial Na⁺ flux
- Net Water Flux
- Water & Osmolality outputs

> [!NOTE]
> **Result:** Na⁺ absorption, osmotic pull, and water flux all cease. K⁺ imbalance switches from accumulation to depletion (from K⁺ exit through Kir).

> [!TIP]
> Insight 4D: Removing the solute absorption driver removes the osmotic tendency for water absorption.

## Experiment 4E: Collecting Duct Water Reabsorption

In this experiment, you will examine how water permeability and a background osmotic pull interact in a layout modeling the **collecting-duct**.

Press the **Reset** button to remove any placed transporters (or remove Kir and Na⁺/K⁺-ATPase) to build the following layout.

```
Apical AQP
Basolateral AQP
(Barrier paracellular pathway)
Background osmotic pull: tissue default (or "Equal/no background pull")
```

Note the absence of water flux.

To simulate collecting duct osmotic conditions, click on the **Settings** button. In the new window, under Background Osmotic Pull, change the setting from "Use tissue default" to "Moderate toward blood".  Then close the settings window.

```
Apical AQP
Basolateral AQP
Background osmotic pull: Moderate toward blood
(Barrier paracellular pathway)
```

In the Water Flux card, note the change in osmotic pull and water flux, and that the card now indicates that a background pull is present.

The hormone AVP (ADH) increases water permeability mainly by increasing apical AQP2 in collecting duct principal cells. Test this by altering the density of AQP on the apical membrane.  

> [!NOTE]
> **Result:** Net water flux 0.9 with moderate background osmotic pull and default AQP density. Decreases to 0.6 with low AQP density, and increases to 1.2 with high AQP density.

> [!TIP]
> Insight 4E: Collecting duct water reabsorption requires both AQP-mediated water permeability and a background osmotic pull toward blood; increasing AQP density changes permeability, not the driving force.



## Mini-Challenge 4: Add Water Movement to Glucose Absorption

In Lesson 2, you built a glucose absorption layout. In Lesson 3, you learned how to reduce the K⁺ imbalance caused by Na⁺/K⁺-ATPase.

Now build a glucose absorption layout that can also support water absorption.

Press the **Reset** button to remove any placed transporters and background osmotic pull, then build the following layout:

```text
Apical SGLT
Basolateral GLUT
Basolateral Na⁺/K⁺-ATPase
Basolateral Kir
(Barrier paracellular pathway, no background osmotic pull)
```

**Challenge**

Add the minimum additional transporter placement needed to produce net epithelial water absorption.

**Targets**

Your final layout should:

- maintain net epithelial glucose absorption,
- include Na⁺ gradient support for SGLT,
- include K⁺ recycling or balancing,
- provide water permeability,
- show net transepithelial water absorption.

> [!NOTE]
> **Solution**:
> A potential solution is:
> ```
> Apical AQP
> Apical SGLT
> Basolateral AQP
> Basolateral GLUT
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```
> Kir could also be on the apical membrane, but as noted in Mini-Challenge 3, this wouldn't preserve the glucose absorption phenotype.

> [!TIP]
> Insight Mini-Challenge 4: Water absorption can be added to glucose absorption by adding a complete water pathway while preserving the solute absorption layout.

---

# Lesson 5: Chloride Secretion and Water Secretion

**Estimated active time:** 15–20 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Explain why apical Cl⁻ exit alone is not enough to produce a complete Cl⁻ secretory mechanism.
- Identify basolateral loading and apical exit as complementary steps in epithelial secretion.
- Explain how Na⁺/K⁺-ATPase supports NKCC-dependent Cl⁻ loading.
- Explain why K⁺ recycling can support a Cl⁻ secretory layout.
- Use net Cl⁻ flux to identify epithelial Cl⁻ secretion.
- Extend a solute secretory layout to produce water secretion when water permeability is present.

## Starting Question

In earlier lessons, most examples focused on absorption: solutes moving from the lumen toward the blood side. Now you will build a secretory mechanism. **Secretion** means net movement from the blood side toward the lumen.

Open the **Concentrations** tab and note from the graph that the Cl⁻ concentration is much higher in the ECF (105 mmol/L) than in the ICF (10 mmol/L).

For Cl⁻ secretion, the epithelial cell needs two major steps:

1. Cl⁻ must be loaded into the cell from the blood/interstitial side.
2. Cl⁻ must exit across the apical membrane into the lumen.

This is the same entry-exit logic you used for absorption, but the direction across the epithelium is reversed. This lessons focuses on **net Cl⁻ flux**.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 5A: CFTR

The cystic fibrosis transmembrane conductance regulator (**CFTR**) is a chloride channel, but it also conducts bicarbonate.

Add **CFTR** to the **apical membrane**.

```
Apical CFTR
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Cl⁻ flux across the apical membrane
- Net epithelial Cl⁻ flux
- Intracellular Cl⁻ tendency, if shown
- Cell balance

CFTR provides an apical anion pathway. In a secretory epithelium, this can allow Cl⁻ to leave the cell into the lumen.

However, an apical exit pathway alone may not be enough. If the cell does not have a way to load Cl⁻ from the blood/interstitial side, there may not be enough intracellular Cl⁻ movement to support a complete secretory mechanism.

> [!NOTE]
> **Result:** Positive apical flux for Cl⁻ flux (0.33) and HCO₃⁻ (0.08), with intracellular accumulation for both.

> [!TIP]
> Insight 5A: Apical CFTR alone provides an anion pathway but not a complete Cl⁻ secretory mechanism.

## Experiment 5B: NKCC

The Na–K–Cl cotransporter (**NKCC**) is a symporter that transports one Na⁺, one K⁺, and two Cl⁻ (1Na:1K:2Cl).  

Keep apical CFTR and add NKCC to the basolateral membrane.

```
Apical CFTR
Basolateral NKCC
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Cl⁻ and HCO₃⁻ fluxes
- Na⁺ and K⁺ fluxes
- Cell balance

NKCC is a cotransporter. It can move Na⁺, K⁺, and Cl⁻ together across the membrane.

In this layout, basolateral NKCC can provide a Cl⁻ loading step from the blood/interstitial side into the cell. Apical CFTR can then provide a Cl⁻ exit step into the lumen.

This gives the basic epithelial logic of secretion:

> basolateral loading → cell → apical exit → lumen

At this point, the layout may still be incomplete because NKCC depends on ion gradients that are normally supported by other transporters.

> [!NOTE]
> **Result:** Positive apical fluxes for Cl⁻ and HCIO3-, and intracellular accumulation of both are unchanged

> [!TIP]
> Insight 5B: Basolateral NKCC can load Cl⁻ into the cell but still requires gradient support.

## Experiment 5C: Add Na⁺/K⁺-ATPase and Kir to Support NKCC

Now add **Na⁺/K⁺-ATPase** and **Kir** to the basolateral membrane.

```
Apical CFTR
Basolateral NKCC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Net epithelial Cl⁻ flux
- Na⁺ and K⁺ fluxes
- Cell balance
- Electrochemical context table

This is a simplified **secretory epithelial** layout relevant to tissues such as **intestinal crypt epithelium**, **airway surface epithelium**, and some **exocrine ducts**. The exact transporters and regulation differ by tissue, but the common pattern is basolateral Cl⁻ loading plus apical anion exit.

> [!NOTE]
> **Result:** Net secretion of Cl⁻ (-0.13). Negative basolateral flux for Na⁺ (-0.33) and K⁺ (-0.04), positive apical flux for HCO₃⁻ (0.06). Accumulation of Na⁺ (0.333) and Cl⁻ (0.534). Weak lumen-negative TEP (-0.13).

> [!TIP]
> Insight 5C: Na⁺/K⁺-ATPase and Kir support NKCC-dependent Cl⁻ secretion by maintaining Na⁺ and K⁺ gradients

## Electrochemical Context: Why Cl⁻ Can Leave Through CFTR

After adding CFTR, NKCC, and Na⁺/K⁺-ATPase, open the **Details** tab and look at the **Electrochemical Context** table.

You may notice something that seems surprising. For apical CFTR, the concentration of Cl⁻ is much higher in the ECF than in the ICF, which would seem to favor movement from the lumen into the cell. However, the net Cl⁻ flux is secretory, meaning Cl⁻ moves against its concentration gradient.

This is possible because Cl⁻ is an ion.

For ions, the concentration gradient is only one part of the driving force. Ion movement depends on the combined effect of:

- the **chemical force**, which depends on concentration differences, and
- the **electrical force**, which depends on charge and voltage.

Together, these create the **net electrochemical force**.

You can view a summary of these forces in the **Details** tab under **Electrochemical Context**, which summarizes the combined direction SALT expects for that ion through that pathway.

For example, in this Cl⁻ secretory layout:

- The **chemical tendency** for Cl⁻ through the apical CFTR favors **lumen → cell**.
- The **electrical tendency** favors **cell → lumen**.
- The **net electrochemical tendency** favors **cell → lumen**.

This means that Cl⁻ exit through CFTR can be supported even when the concentration gradient alone does not explain the direction.

CFTR is still not a pump. It does not use ATP to force Cl⁻ uphill. CFTR provides an apical anion pathway. The direction of Cl⁻ movement depends on the net electrochemical tendency.

> [!TIP]
> Insight 5 Electrochemical Context: Cl⁻ flux through CFTR depends on net electrochemical tendency, not concentration gradient alone.

## Mini-Challenge 5: Water Secretion

In Lesson 4, you learned about water absorption. Some epithelial tissues need to move water in the opposite direction to secrete water into a lumen. 

### Challenge

Using a Cl⁻ secretory layout as the foundation, add the minimum additional transporters needed to produce **net epithelial water secretion**.

### Targets

Your final layout should:

- maintain net epithelial Cl⁻ secretion,
- preserve basolateral Cl⁻ loading and apical Cl⁻ exit,
- include K⁺ recycling,
- provide a transcellular water pathway,
- show net epithelial water movement toward the lumen.

Use the **Net Water Flux** output to determine whether water secretion occurred.

> [!NOTE]
> **Solution:**
>
> ```
> Apical AQP
> Apical CFTR
> Basolateral AQP
> Basolateral NKCC
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>

> [!TIP]
> Insight Mini-Challenge 5: Water secretion can be added to Cl⁻ secretion by adding a complete water pathway.

---

# Lesson 6: Transepithelial Potential

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Distinguish transepithelial potential from membrane potential.
- Explain why movement of charged solutes can create a transepithelial potential.
- Predict how cation absorption, cation secretion, and anion secretion can affect TEP.
- Explain why movement of opposite charges, or movement of charge in opposite epithelial directions, can reduce the net epithelial electrical tendency.
- Use TEP as one output for interpreting epithelial transport layouts.
- Recognize that TEP can influence charged paracellular flux in later experiments.

## Starting Question

In earlier lessons, you saw that Na⁺ absorption can generate a **transepithelial potential** (**TEP**).

You already know membrane potential from neurons and other excitable cells. Membrane potential is the voltage across one cell membrane.

TEP is different. TEP is the voltage tendency across the entire epithelial layer, comparing the lumen side with the blood/interstitial side.

In SALT, TEP is reported qualitatively and is expressed in imaginary "charge units" rather than voltage. Therefore, treat TEP results as an epithelial-scale electrical tendency rather than an exact voltage.

The main idea for this lesson is:

> TEP depends on the net movement of charge across the epithelial layer.

A layout that moves mostly one charged solute in one direction can create a stronger TEP. A layout that moves charged solutes in electrically balancing ways may create a smaller TEP.

In the next lesson, TEP will become especially important because charged solutes can move through paracellular pathways.

## Setup

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 6A: Create TEP With Na⁺ Absorption

Build the simple Na⁺ absorption layout (with unbalanced K⁺ accumulation):

```
Apical ENaC
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```
Observe:

- Na⁺ and K⁺ fluxes
- Cell balance
- TEP in the Results Snapshot and more details in the **Details** tab under **Charge & Polarity**

> [!NOTE]
> **Result:** Na⁺ absorption (0.50) and a moderate lumen-negative TEP (0.50). Intracellular K⁺ accumulation (0.33).

> [!TIP]
> Insight 6A: Isolated Na⁺ absorption creates a TEP because positive charge moves toward the blood side.

## Experiment 6B: Add K⁺ Recycling

Keep the same Na⁺ absorption layout, but add basolateral Kir:

```
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
Barrier paracellular pathway
```
Observe:

- Na⁺ and K⁺ fluxes
- Cell balance
- TEP

Basolateral Kir provides a K⁺ pathway on the blood/interstitial side. In this layout, K⁺ movement through basolateral Kir mainly supports K⁺ recycling or Cell balance rather than producing a large net epithelial K⁺ secretory flux.

Compare TEP in this layout with the TEP from Experiment 5A.

> [!NOTE]
> **Result:** Na⁺ absorption (0.50) and positive basolateral K+ flux (0.33), but intracellular K⁺ is balanced. TEP remains lumen-negative (-0.50), and the main epithelial charge movement is still associated with Na⁺ absorption.

> [!TIP]
> Insight 6B: K⁺ recycling improves Cell balance without substantially changing the dominant TEP source.

## Experiment 6C: Compare Apical K⁺ Movement

Now move Kir from the basolateral membrane to the apical membrane:

```
Apical ENaC
Apical Kir
Basolateral Na⁺/K⁺-ATPase
Barrier paracellular pathway
```
Observe:

- Na⁺ and K⁺ fluxes
- Cell balance
- TEP

In this layout, apical Kir connects the cell to the lumen. This allows K⁺ movement toward the lumen, producing K⁺ secretion.

Compare the TEP in this layout with the TEP from Experiments 5A and 5B.

> [!NOTE]
> **Result:** Na⁺ absorption remains (0.50). Apical K⁺ flux produces net K⁺ secretion (-0.29). TEP is still lumen-negative but smaller (-0.21).

> [!TIP]
> Insight 6C: Apical K⁺ secretion partially offsets the TEP created by Na⁺ absorption.

## Experiment 6D: Create TEP With K⁺ Secretion Alone

Remove apical ENaC to build a K⁺ secretion layout using only Na⁺/K⁺-ATPase and Kir:

```
Apical Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺ and K⁺ fluxes
- Cell balance
- TEP

This layout moves K⁺ toward the lumen. K⁺ is positively charged, so K⁺ secretion moves positive charge in the opposite epithelial direction from Na⁺ absorption.

Compare this TEP with the TEP from simple Na⁺ absorption.

> [!NOTE]
> **Result:** This layout produces net K⁺ secretion (-0.29). The TEP is now lumen-positive (0.29). Na⁺ depletion (-0.44).

> [!TIP]
> Insight 6D: K⁺ secretion alone creates a TEP opposite in polarity from Na⁺ absorption.



## Experiment 6E: Compare TEP From Anion Secretion

In Lesson 5, you built a Cl⁻ secretory layout. Now use that layout to compare the electrical effect of **anion secretion** on TEP.

Press **Reset**.

Rebuild the Cl⁻ secretion layout from Lesson 5:

```
Apical CFTR
Basolateral NKCC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Net fluxes of Cl⁻, Na⁺, and K⁺.
- TEP in the Results Snapshot and in the **Details** tab under **Charge & Polarity**
- **Electrochemical Context** for CFTR and Kir in the **Details** tab

In this layout, Cl⁻ moves toward the lumen. Cl⁻ is negatively charged, so Cl⁻ secretion does not have the same electrical meaning as K⁺ secretion. Both are secretory fluxes, but they move opposite charges.

Compare this layout with the earlier experiments:

- **Na⁺ absorption:** positive charge moves toward the blood side.
- **K⁺ secretion:** positive charge moves toward the lumen.
- **Cl⁻ secretion:** negative charge moves toward the lumen.

The important comparison is that anion secretion can create an epithelial electrical tendency that resembles cation absorption, because moving negative charge toward the lumen is electrically similar to moving positive charge toward the blood side.

Use the TEP output to compare the direction and relative strength of the electrical tendency.

> [!NOTE]
> **Result:** As in Lesson 5C, the main effect is net Cl⁻ secretion. TEP is weakly lumen-negative (-0.13). 

> [!TIP]
> Insight 6E: Anion secretion can create a TEP effect similar to cation absorption because negative charge moves toward the lumen.

## Mini-Challenge 6: Reduce TEP While Preserving Transport

Start with the following layout:

```
Apical ENaC
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

This layout produces Na⁺ absorption, but it also creates a TEP because positive charge is moving toward the blood side.

**Challenge**: 

Modify the layout by adding **one transporter** so that:

- net epithelial Na⁺ absorption is preserved, and
- TEP is reduced compared with the starting layout.

Use only one of the following transporters: Kir, CFTR, or NKCC

**Target**: The best answer should reduce TEP by adding an epithelial charge movement that partially offsets Na⁺ absorption.

> [!NOTE]
> **Solution:**
> ```
> Apical Kir
> Apical ENaC
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```

> [!TIP]
> Insight Mini-Challenge 6: TEP can be reduced by adding an opposing epithelial charge movement while preserving the target flux.


---
# Lesson 7: Paracellular pathways

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Distinguish transcellular movement from paracellular movement.
- Explain why movement between cells still contributes to net epithelial flux.
- Use Barrier as a baseline condition for isolating transcellular flux.
- Predict how cation, anion, and water permeability can alter net epithelial flux.
- Explain how TEP can influence charged paracellular flux.
- Explain why a paracellular pathway can support, oppose, or override a transcellular mechanism.

## Starting Question

In previous lessons, you built layouts in which solutes and water moved **through** epithelial cells. This is called **transcellular transport** because movement occurs across the apical and basolateral membranes.

Epithelia can also allow movement **between** cells. This is called **paracellular transport**.

In SALT, the paracellular pathway is simplified into four settings:

1. **Barrier**: No paracellular solute or water flux.
2. **Cation + Water Pore**: Allows cations and water to move between cells.
3. **Cation Pore**: Allows cations to move between cells without water.
4. **Anion Pore**: Allows anions to move between cells.

Real tight junctions are more complex than these four categories. They vary by tissue and can differ in selectivity, permeability, and regulation. In this lesson, focus on the core idea:

> A paracellular pathway is another route across the epithelial layer, so it can change the net epithelial result even when the membrane transporters stay the same.

In Lesson 6, you used TEP to interpret the electrical tendency created by transcellular movement of charged solutes. In this lesson, TEP becomes important in a new way:

> When a paracellular pathway allows charged solutes to move between cells, TEP can influence the direction of that paracellular movement.

Use **Cation + Water Pore** when you want a cation-selective paracellular route that also carries water. Use **Cation Pore** when you want cation movement without paracellular water, which is the kind of simplification used for some water-tight but cation-leaky epithelia.



## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 7A: Barrier Pathway

Build a simple Na⁺ absorption layout with K⁺ recycling:

```
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Look at the **Mechanism** view first, then check **Membrane and Epithelial Fluxes** if you want the flux values.

Observe:

- Na⁺ and K⁺ fluxes membrane
- Na⁺ and K⁺ paracellular fluxes
- Na⁺ and K⁺ net epithelial fluxes
- TEP
- Osmotic pull and water flux

With **Barrier** selected, the paracellular pathway does not contribute solute or water flux. This gives you a baseline for interpreting the membrane transporter layout by itself.

> [!NOTE]
> **Result:** This is the same basic layout as Lesson 3B and Lesson 4A. There is Na⁺ absorption, basolateral K⁺ recycling, no paracellular flux, weak osmotic pull toward blood, and no water flux because the Barrier pathway provides no water permeability.

> [!TIP]
> Insight 7A: With Barrier selected, net epithelial flux reflects the transcellular layout without paracellular contribution.

## Experiment 7B: Cation + Water Pore

Keep the same membrane transporters as above, but change the paracellular pathway from **Barrier** to **Cation + Water Pore**.

```
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Cation + Water Pore paracellular pathway)
```
Compare the new result with the Barrier baseline.

Observe:

- Paracellular fluxes of Na⁺ and K⁺ flux
- Net epithelial fluxes of Na⁺ and K⁺
- TEP
- Osmotic pull and water flux

Note that the "Cation + Water" paracellular setting is a simplified teaching category. It is not a complete model of a specific leaky epithelium. The goal in SALT is to observe how adding a between-cell route can change net epithelial flux.

> [!NOTE]
>  **Result:** Net Na⁺ absorption remains positive but is reduced (0.24) because the cation pathway adds a negative paracellular Na⁺ back-leak (-0.26). A smaller paracellular K⁺ back-leak appears (-0.19). TEP is shunted to a weak lumen-negative value (-0.05), and the water tendency remains weakly toward blood rather than reversing.

> [!TIP]
> Insight 7B: A cation + water pore can add paracellular cation and water flux that changes the net epithelial result.

## Experiment 7C: Anion Pore

Keep the same membrane transporters but change the paracellular pathway to **Anion Pore**.

```
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Anion Pore paracellular pathway)
```

Compare this result with the previous conditions:

- Barrier
- Cation + Water Pore
- Cation Pore

Observe:

- Paracellular Cl⁻ and HCO₃⁻ fluxes
- Net epithelial anion fluxes
- Na⁺ and K⁺ fluxes
- TEP
- Osmotic pull and water flux

The membrane transporters are still unchanged. The only change is the paracellular pathway.

Because the Anion Pore allows anions rather than cations to move between cells, its effects can differ from the Cation + Water Pore. Cl⁻ and HCO₃⁻ carry negative charge, so their paracellular movement responds differently to epithelial electrical tendency than Na⁺ or K⁺ movement.

> [!NOTE]
>  **Result:** Positive paracellular fluxes for Cl⁻ (0.18) and HCO₃⁻ (0.18) are added to the Na⁺ absorption layout. Net Na⁺ flux remains positive (0.50), net K⁺ flux remains near zero, osmotic pull increases toward blood, and there is no water flux because the Anion Pore does not provide a water pathway. TEP is shunted but remains weakly lumen-negative (-0.14).

> [!TIP]
> Insight 7C: An anion pore can add paracellular anion flux without providing water permeability.



## Mini-Challenge 7: Convert Osmotic Pull Into Water Flux

In this lesson, you learned that paracellular pathways can add solute movement between cells. You also learned that different paracellular pathways allow different things to move.

Your task is to build and then revise a layout.

### Part 1: Build osmotic pull without water flux

Build a layout that meets all of these targets:

- Net epithelial Na⁺ flux is absorptive.
- K⁺ accumulation is reduced compared with simple ENaC and Na⁺/K⁺-ATPase.
- Paracellular anion movement is present.
- Osmotic pull is toward the blood side.
- Net water flux is absent.

Use only:

- ENaC
- Na⁺/K⁺-ATPase
- Kir
- Any paracellular pathway setting



### Part 2: Add the missing water pathway

Starting from your Part 1 layout, add the minimum transporter placement needed to produce net epithelial water absorption.

Your final layout should:

- preserve net Na⁺ absorption,
- preserve paracellular anion movement,
- preserve K⁺ recycling or balancing,
- show net epithelial water absorption.



> [!NOTE]
> **Part 1 Solution:**
>
> Apical ENaC
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> Anion Pore paracellular pathway
>
> **Part 2 Solution:**
>
> Apical AQP
> Apical ENaC
> Basolateral AQP
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> Anion Pore paracellular pathway
>
> The key reasoning is that the anion pore allows paracellular anion movement but does not provide water permeability. AQP on both membranes provides the missing transcellular water pathway.

> [!TIP]
> Insight Mini-Challenge 7: Osmotic pull can be converted into water flux only by adding a complete water pathway.

# Lesson 8: NaCl Absorption

**Estimated active time:** 15–20 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Explain why Na⁺ absorption is not the same thing as NaCl absorption.
- Use net Na⁺ flux and net Cl⁻ flux to evaluate whether a layout supports NaCl absorption.
- Explain why apical NaCl entry alone is not complete epithelial NaCl absorption.
- Identify basolateral Cl⁻ exit as a necessary step in transcellular NaCl absorption.
- Explain why coordinated Na⁺ and Cl⁻ movement tends to have a different TEP effect than isolated Na⁺ absorption.
- Build an alternative salt-absorptive layout that uses a paracellular anion route.

## Starting Question

In earlier lessons, you built layouts that absorb Na⁺, secrete Cl⁻, move water, create TEP, and use paracellular pathways.

Now you will bring Na⁺ and Cl⁻ together.

A simple mistake is to assume that if Na⁺ is absorbed, then NaCl is absorbed. That is not necessarily true, as NaCl absorption requires epithelial movement of both:

- Na⁺ toward the blood side, and
- Cl⁻ toward the blood side.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

------

## Experiment 8A: Absorb Na⁺ Without Absorbing Cl⁻

Build the familiar Na⁺ absorption layout with K⁺ recycling:

```text
Apical ENaC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Net epithelial Na⁺ and Cl⁻ flux
- TEP
- Cell balance

This layout supports Na⁺ absorption because ENaC provides apical Na⁺ entry and Na⁺/K⁺-ATPase supports basolateral Na⁺ handling. Basolateral Kir helps reduce K⁺ accumulation.

However, this layout does not provide a Cl⁻ absorption pathway.

> [!NOTE]
> **Result:** This is the layout from experiment 3B. Na⁺ absorption (0.50), basolateral K⁺ flux (0.33), cell balance, and moderate, lumen-negative TEP (-0.50). 

> [!TIP]
> Insight 8A: Na⁺ absorption alone does not demonstrate NaCl absorption.

------

## Experiment 8B: NCC

Press **Reset**.

The Na-Cl cotransporter, NCC, is a symporter that moves Na⁺ and Cl⁻ across a membrane in the same direction. Use apical NCC in the following simple layout:

```text
Apical NCC
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺ and Cl⁻ fluxes
- TEP
- Cell balance

> [!NOTE]
> **Result:** Na⁺ absorption (0.30) and positive apical Cl⁻ flux (0.30). Accumulation of K⁺ (0.20) and Cl⁻ (0.30). Weak lumen-negative TEP (-0.30).

> [!TIP]
> Insight 8B: NCC provides coupled apical NaCl entry, but apical entry alone is not a complete epithelial pathway.


## Experiment 8C: Add K⁺ Recycling

Keep the layout from Experiment 8B and add **Kir** to the basolateral membrane:

```text
Apical NCC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺, K⁺, and Cl⁻ fluxes
- TEP
- Cell balance

> [!NOTE]
> **Result:** No change to Na⁺ absorption (0.30) or positive apical Cl⁻ flux (0.30). Addition of basolateral K⁺ flux (0.29). Cl⁻ accumulation (0.30). Unchanged weak lumen-negative TEP (-0.30).

> [!TIP]
> Insight 8C: K⁺ recycling can improve cell balance without solving the missing Cl⁻ exit step.

## Experiment 8D: ClC

The chloride channel, **ClC**, transports Cl⁻ passively across the membrane.

Keep the layout from Experiment 8C add ClC to the basolateral membrane:

```text
Apical NCC
Basolateral ClC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺ and Cl⁻ fluxes
- TEP and electrochemical context
- Cell balance

> [!NOTE]
> **Result:** Cl⁻ absorption (0.06) and no change to Na⁺ absorption (0.30). Positive basolateral K⁺ flux (0.29). Lumen-negative TEP (-0.24). Accumulation of Cl⁻ (0.242).

> [!TIP]
> Insight 8D: Basolateral ClC adds the missing Cl⁻ exit step and supports transcellular NaCl absorption.

## Mini-Challenge 8: Salt Absorption Without NCC or ClC

In the experiments above, you built a transcellular NaCl absorption layout using NCC and ClC.

Now build a different salt-absorptive layout **without using NCC or ClC**.

This challenge asks you to apply a new constraint: If you cannot use a coupled NaCl cotransporter, can you still build a layout that absorbs Na⁺ and adds an anion route?

The NCC and ClC layout resembles a simplified **distal convoluted tubule** NaCl absorption mechanism. 

### Challenge

Build a layout that starts with transcellular Na⁺ absorption and adds a paracellular anion route.

### Constraints

Do **not** use:

- NCC
- ClC
- CFTR
- NKCC
- AQP

### Targets

Your final layout should:

- produce net epithelial Na⁺ absorption,
- reduce K⁺ accumulation with a recycling pathway,
- show paracellular anion movement,
- support salt-associated absorption more strongly than ENaC alone.



> [!NOTE]
> **Solution:**
>
> ```text
> Apical ENaC
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Anion Pore paracellular pathway)
> ```
>
> The anion pore provides a paracellular route for anions such as Cl⁻ and HCO₃⁻.
>
> This layout is not the same as transcellular NCC and ClC NaCl absorption. Instead, it demonstrates a different salt-associated absorption strategy: Na⁺ and anion movement can occur through different epithelial routes.

> [!TIP]
> Insight Mini-Challenge 8: Salt-associated absorption can be built without NCC by combining transcellular Na⁺ absorption with paracellular anion movement.

---

# Lesson 9: Nutrient Absorption

**Estimated active time:** 20 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Explain how one epithelium can absorb multiple solutes using similar epithelial logic.
- Identify apical uptake, basolateral exit, Na⁺ gradient support, and K⁺ recycling as recurring functional roles.
- Compare glucose, phosphate, and amino acid absorption pathways.
- Explain why Na⁺/K⁺-ATPase can indirectly support absorption of solutes it does not directly transport.
- Predict how multi-solute absorption can contribute to osmotic pull and water absorption.

## Starting Question

In earlier lessons, you built glucose absorption and phosphate absorption as separate layouts. Each layout used a similar pattern:

> apical Na⁺-linked uptake → intracellular solute → basolateral exit

Now you will combine this logic into a more tissue-like absorptive epithelium.

Many absorptive epithelia, such as small intestinal absorptive cells and renal proximal tubule cells, absorb several solutes at the same time. The exact transporters differ by tissue, but the epithelial logic is similar:

- solutes enter from the lumen through apical transporters,
- solutes exit toward the blood side through basolateral pathways,
- Na⁺/K⁺-ATPase supports Na⁺-linked uptake by maintaining the Na⁺ gradient,
- K⁺ recycling helps support continued pump function and Cell balance,
- solute absorption can create or support water absorption if water permeability is present.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 9A: Glucose Absorption

Build the glucose absorption layout from earlier lessons:

```text
Apical SGLT
Basolateral GLUT
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Net epithelial glucose flux
- Na⁺ and K⁺ fluxes
- Cell balance
- Osmotic pull and water flux

This layout uses SGLT for apical glucose uptake, GLUT for basolateral glucose exit, Na⁺/K⁺-ATPase for Na⁺ gradient support, and basolateral Kir for K⁺ recycling.

The target solute is glucose, but the supporting solute is Na⁺.

This reinforces an important principle:

> A transporter can indirectly support absorption of a solute it does not directly transport.

Na⁺/K⁺-ATPase does not transport glucose, but it supports the Na⁺ gradient that allows SGLT to move glucose.

> [!NOTE]
> **Result:** Glucose absorption (0.35), Na⁺ absorption (0.35), positive basolateral K⁺ flux (0.29). Slight K⁺ depletion (-0.06) and glucose accumulation (6.49). ICF glucose is increased (7.49). TEP is weakly lumen-negative (-0.35). Osmotic pull is toward the blood (0.3).

> [!TIP]
> Insight 9A: Glucose absorption uses apical uptake, basolateral exit, Na⁺ gradient support, and K⁺ recycling.

## Experiment 9B: Phosphate Absorption

Press **Reset** or remove SGLT and GLUT.

Build a phosphate absorption layout:

```text
Apical NaPi 2:1
Basolateral Pi Facilitator
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺, K⁺, and Pi fluxes
- Cell balance
- Osmotic pull and water flux

This layout uses the same functional pattern as glucose absorption:

| Functional role          | Glucose layout  | Phosphate layout |
| ------------------------ | --------------- | ---------------- |
| Apical Na⁺-linked uptake | SGLT            | NaPi             |
| Basolateral exit         | GLUT           | Pi Facilitator   |
| Na⁺ gradient support     | Na⁺/K⁺-ATPase   | Na⁺/K⁺-ATPase    |
| K⁺ recycling             | Basolateral Kir | Basolateral Kir  |

The transporters are different, but the epithelial strategy is similar.

> [!NOTE]
> **Result:** Pi absorption (0.30), Na⁺ absorption (0.60), positive basolateral K⁺ flux (0.15). K⁺ accumulation (0.253). TEP is neutral. Osmotic pull is toward the blood (0.4).

> [!TIP]
> Insight 9B: The glucose absorption pattern can be transferred to phosphate using different transporters with the same functional roles.

## Experiment 9C: Amino Acid Absorption

Press **Reset** or remove NaPi and Pi facilitator.

Like SGLT for glucose and NaPi for Pi, the **Na⁺-AA** cotransporter moves Na⁺ and amino acids in across the membrane in the same direction. Note that in SALT, Na⁺-AA is a simplification that represents a family of symporters for different amino acids.

Similarly, like GLUT and the Pi facilitator, the **AA facilitator** in SALT represents a family of transporters that move amino acids passively across the membrane.

Use Na⁺-AA and the AA facilitator to build an amino acid absorption layout:

```text
Apical Na⁺-AA
Basolateral AA Facilitator
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Net epithelial amino acid flux
- Na⁺ and K⁺ fluxes
- Cell balance
- Osmotic pull and water flux



> [!NOTE]
> **Result:** AA absorption (0.35), Na⁺ absorption (0.35), positive basolateral K⁺ flux (0.15). TEP is weakly lumen-negative (-0.35). Osmotic pull is toward the blood (0.3).

> [!TIP]
> Insight 9C: Amino acid absorption can use the same apical Na⁺-linked uptake and basolateral exit logic.

## Experiment 9D: Multiple Nutrient Absorption Pathways

Now combine the layouts above to build a multi-solute absorption layout:

```text
Apical SGLT
Apical NaPi 2:1
Apical Na⁺-AA
Basolateral GLUT
Basolateral Pi Facilitator
Basolateral AA Facilitator
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Glucose, Pi, AA, Na⁺, and K⁺ fluxes
- TEP
- Cell balance
- Osmotic pull and water flux

This layout combines several Na⁺-linked absorptive pathways in the same epithelial cell.

> [!NOTE]
> **Result:** Absorption of Na⁺ (0.60), Pi (0.30), glucose (0.35), and AA (0.35). Positive basolateral K⁺ flux (0.40). Accumulation of Na⁺ (0.696) and glucose (6.493). TEP is neutral. Osmotic pull is toward the blood (0.8).

> [!TIP]
> Insight 9D: Multiple Na⁺-linked nutrient uptake pathways can operate together and increase the importance of Na⁺ gradient support.

## Experiment 9E: Add Water Absorption

In the preceding experiment, many solutes were absorbed, and the osmotic pull was strong, but there was no water flux. Keep the multi-solute absorption layout from Experiment 9D, but add AQP to both membranes to provide a transcellular water pathway:

```text
Apical AQP
Apical SGLT
Apical NaPi 2:1
Apical Na⁺-AA
Basolateral AQP
Basolateral GLUT
Basolateral Pi Facilitator
Basolateral AA Facilitator
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Osmotic pull
- Net Water Flux

This experiment combines the nutrient absorption logic from this lesson with the water movement logic from Lesson 4.

The key idea is:

> Coordinated solute absorption can create or support osmotic pull, but water absorption still requires water permeability.

> [!NOTE]
> **Result:** Water absorption (0.8) now matches the osmotic pull. Solute fluxes remain as listed for experiment 9D. No effect on TEP.

> [!TIP]
> Insight 9E: Coordinated nutrient absorption can support osmotic pull, but water flux still requires water permeability.

## Mini-Challenge 9

[Placeholder]



## Mechanism Summary

Several absorptive pathways can use the same epithelial design:

> apical uptake + basolateral exit + gradient support + cell-balance support

For many nutrients, apical uptake is Na⁺-linked. Na⁺/K⁺-ATPase indirectly supports these pathways by maintaining the Na⁺ gradient.

Different solutes can use different apical and basolateral transporters, but the functional roles are similar:

| Role             | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| Apical uptake    | Brings the solute from lumen into the cell                 |
| Basolateral exit | Allows completed epithelial absorption toward blood        |
| Na⁺/K⁺-ATPase    | Maintains the Na⁺ gradient that supports Na⁺-linked uptake |
| Basolateral Kir  | Supports K⁺ recycling and Cell balance                     |
| AQP              | Provides a water pathway when osmotic pull is present      |

A tissue-like absorptive layout is not just a list of transporters. It is a coordinated pathway in which each transporter has a functional role.

------

# Lesson 10: Acid/Base Transport

**Estimated active time:** 20–25 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Interpret Net Acid/Base Flux as a qualitative epithelial tendency.
- Explain why H⁺ movement across one membrane is not necessarily net epithelial acid secretion.
- Explain how epithelial acid/base transport can involve paired movement of H⁺ and HCO₃⁻.
- Use CO₂ supply of intracellular H⁺ and HCO₃⁻ to interpret acid/base layouts.
- Compare acid-secreting and base-secreting epithelial layouts.
- Explain how the same acid/base solutes can produce different epithelial effects depending on membrane polarity and transporter placement.

## Starting Question

Some epithelial cells regulate acid/base balance by transporting **H⁺** or **HCO₃⁻**. In these layouts, do not think only about one transporter on one membrane. Instead, ask which acid/base product moves across the apical membrane, and which acid/base product moves across the basolateral membrane.

In acid/base epithelial cells, intracellular **CO₂** can react with H₂O to supply paired **H⁺** and **HCO₃⁻**. This reaction is catalyzed by the enzyme carbonic anhydrase. SALT will show a message in the **Acid/Base & pH** results when CO₂ is supplying H⁺ and HCO₃⁻ for the modeled layout.

In SALT, **acid/base flux** is qualitative, not quantitative. It is not a full pH calculation, but you can use the results as evidence for the epithelial acid/base tendency.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

## Experiment 10A: NHE3

Some nephron **proximal tubular cells** secrete H⁺ and absorb HCO3. In this experiment and the following experiment, you will create a model of this acid/base mechanism.

**NHE3** is a Na⁺/H⁺ exchanger. It moves Na⁺ in one direction while moving H⁺ in the opposite direction.

Build this layout:

```text
Apical NHE3
Basolateral Na⁺/K⁺-ATPase
Basolateral Kir
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- Na⁺ and H⁺ flux
- Net Acid/Base Flux
- Cell balance
- TEP

In this layout, apical NHE3 can support Na⁺ movement from the lumen into the cell while moving H⁺ toward the lumen.

This means a Na⁺ absorptive mechanism can also have an acid/base consequence.

> [!NOTE]
> **Result:** Negative apical H⁺ flux (-0.5), Na⁺ absorption (0.5), and basolateral positive K⁺ flux (0.15). K⁺ accumulation (0.186), and moderate lumen-negative TEP. No net acid/base flux.

> [!TIP]
>
> Insight 10A: Apical H⁺ secretion occurs through NHE3, but there is no net H⁺ secretion or net acid/base tendency because the layout lacks a coupled basolateral acid/base step.
>



## Experiment 10B: NBC

In the preceding experiment, you achieved H⁺ flux into the lumen, but there was no net acid secretion or base absorption because the reaction was uncoupled.

**NBC** is the electrogenic Na-bicarbonate cotransporter. It moves Na⁺ and HCO₃⁻ in the same direction. You will now use NBC to provide the missing step.

Keep the apical NHE3 layout from Experiment 10A and add NBC to the basolateral membrane.

```text
Apical NHE3
Basolateral NBC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- H⁺, HCO₃⁻, and Na⁺ fluxes
- Net acid/base flux
- Cell balance
- TEP

> [!NOTE]
> **Result:** H⁺ secretion (-0.50), HCO₃⁻ absorption (0.50), Na⁺ absorption (0.50). Accumulation of K⁺ (0.15). Moderate lumen-positive TEP (0.50). Net acid secretion.

> [!TIP]
> Insight 10B: Apical H⁺ secretion alone is incomplete; a basolateral acid/base pathway is needed for a completed epithelial acid/base process.



## Experiment 10C: CFTR HCO₃⁻ Secretion

Some **pancreatic duct cells** secrete HCO₃⁻ into the intestine to neutralize stomach acid. These cells use CFTR to transport HCO₃⁻. In Lesson 5, you used CFTR as an apical anion pathway for Cl⁻ secretion, but recall that CFTR also conducts HCO₃⁻. 

Press **Reset** and build the following layout:

```text
Apical CFTR
Basolateral NBC
Basolateral Kir
Basolateral Na⁺/K⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- HCO₃⁻, Cl⁻, and Na⁺ fluxes
- Net acid/base flux
- TEP
- Cell balance
- Electrochemical context for CFTR

> [!NOTE]
> **Result:** Base secretion (-0.15), with negative basolateral Na⁺ flux (-0.23) and positive basolateral K⁺ flux (0.15). Accumulation of Na⁺ (0.23), Cl⁻ (0.28), and HCO₃⁻ (0.556) and depletion of K⁺ (-0.147). Weak lumen-negative TEP (-0.14). 

> [!TIP]
> Insight 10C: Base secretion follows the same loading-and-exit logic as Cl⁻ secretion, but the transported solute has an acid/base effect.



## Experiment 10D: CBE

In the kidneys, **β-intercalated cells** in the **cortical collecting duct** secrete HCO₃⁻ into the lumen while absorbing H⁺ into the blood.

**CBE** is chloride-bicarbonate exchanger activity: it moves Cl⁻ and HCO₃⁻ in opposite directions. Biological examples include pendrin, AE1/2, DRA/SLC26A3, and SLC26A6/PAT-1. You will now use CBE to model the layout of a β-intercalated cell; pendrin is the relevant example in this tissue.

Press **Reset** and build this layout:

```
Apical CBE
Basolateral H⁺-ATPase
(Barrier paracellular pathway, no background osmotic pull)
```

Observe:

- HCO₃⁻, H⁺, and Cl⁻ flux
- Net acid/base flux
- Cell balance
- In Acid/Base & pH, note the message in the Cell card 

> [!NOTE]
> **Result:** Net base secretion, with H⁺ absorption (0.35) and HCO₃⁻ secretion (-0.35). Positive apical Cl⁻ flux (0.35) and Cl⁻ accumulation. Moderate lumen-negative TEP (-0.70). Message indicates that CO₂ + H₂O is the source of H⁺ and HCO₃⁻.

> [!TIP]
> Insight 10D: A β-intercalated-cell-like layout reverses α-cell polarity: apical CBE supports HCO₃⁻ secretion, while basolateral H⁺-ATPase supports acid-side handling toward the blood side.

## Mini-Challenge 10: Acid Secretion with CBE

In this lesson, you have modeled proximal-tubule-like acid/base handling and two base-secreting epithelial layouts. Now apply the same logic to a different cell type, **α-intercalated-cells**, which are acid-secreting cells in the **cortical collecting duct**.

You will now use the same **CBE** activity on the opposite membrane to build an acid-secreting layout.

### Challenge

Build a simplified **α-intercalated cell** acid-secreting layout using CBE *and* any of the following: NHE3, NBC, and/or H⁺-ATPase. Do not use any other transporters, except Na⁺/K⁺-ATPase if necessary.

### Targets

Your final layout should include **CBE** and show both net H⁺ secretion and net HCO₃⁻ absorption.

> [!NOTE]
> **Solution:**
>
> ```
> Apical H+-ATPase
> Basolateral CBE
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> This layout models an α-intercalated-cell-like acid-secreting pattern. Apical H+-ATPase moves H+ toward the lumen. Basolateral CBE provides HCO₃⁻ exit toward the blood/interstitial side in exchange for Cl−. The Acid/Base & pH output should indicate when CO₂ is supplying intracellular H+ and HCO₃⁻.

> [!TIP]
>
> Insight mini-challenge 10: Acid secretion requires paired polarity: H+ exits apically while HCO₃⁻ exits basolaterally.
>



------

# Lesson 11: Calcium Absorption

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Apply epithelial entry-exit logic to Ca²⁺ absorption.
- Explain why apical Ca²⁺ entry is not the same as completed epithelial Ca²⁺ absorption.
- Compare PMCA and NCX1 as alternative basolateral Ca²⁺ extrusion pathways.
- Explain why NCX1 requires Na⁺ gradient support.
- Use intracellular Ca²⁺ accumulation as a clue that a Ca²⁺ absorption layout is incomplete.
- Build Ca²⁺ absorption layouts using different basolateral extrusion strategies.

## Starting Question

Ca²⁺ is kept at a very low concentration inside cells. This means that when an apical Ca²⁺ pathway is present, Ca²⁺ can readily enter the cell from the lumen.

However, as with all other solutes, transcellular absorption requires entry across the apical membrane and exit across the basolateral membrane.

In this lesson, you will build two different Ca²⁺ absorption layouts. Both use the same apical Ca²⁺ entry pathway, but they use different basolateral Ca²⁺ extrusion mechanisms.

## New Transporters for This Lesson

**TRPV5/6** represents an epithelial calcium channel class that allows Ca²⁺ to move passively across the membrane. 

**PMCA** is the plasma membrane Ca²⁺-ATPase, which uses energy from ATP to pump Ca²⁺ against its concentration gradient.

**NCX1** is the Na⁺/Ca²⁺ exchanger, which moves Ca²⁺ across the membrane in exchange for Na⁺.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).



## Experiment 11A: TRPV5/6 and PMCA 

This experiment models a simplified Ca²⁺-absorbing epithelial cell that aligns with the general logic of **intestinal Ca²⁺ absorption** and **renal distal Ca²⁺ reabsorption**. TRPV5 is especially associated with renal distal Ca²⁺ reabsorption, whereas TRPV6 is commonly associated with intestinal Ca²⁺ absorption. SALT combines these as TRPV5/6 to focus on the shared epithelial logic: apical Ca²⁺ entry plus basolateral Ca²⁺ extrusion.

### Challenge

Build the simplest layout that produces net epithelial Ca²⁺ absorption using TRPV5/6 and PMCA and does not have any intracellular imbalances.

### Targets

Your final layout should:

- show net Ca²⁺ absorption,
- use Barrier as the paracellular pathway.

> [!NOTE]
> **Expected solution:**
>
> ```text
> Apical TRPV5/6
> Basolateral PMCA
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> **Result:** Calcium absorption (0.18). No intracellular imbalance. TEP weakly lumen-negative (-0.36).

> [!TIP]
> Insight 11A: PMCA can complete Ca²⁺ absorption without requiring Na⁺ gradient support.



## Experiment 11B: NCX1

This experiment models an alternative Ca²⁺ absorption strategy that uses **NCX1** for Na⁺-dependent Ca²⁺ transport. This layout also aligns with Ca²⁺-absorbing epithelia such as **renal distal tubule** and **intestinal epithelium**.

### Challenge

Build the simplest layout that produces net epithelial Ca²⁺ absorption using NCX1. You may use other transporters as needed.

### Targets

Your final layout should:

- show Ca²⁺ absorption,
- minimize intracellular imbalance of Ca²⁺ and other ions.
- use Barrier as the paracellular pathway.



> [!NOTE]
> **Solution:**
>
> ```text
> Apical TRPV5/6
> Basolateral NCX1
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> **Result**: Ca²⁺ absorption (0.33). Negative basolateral Na⁺ flux (-1.08) and positive basolateral K⁺ flux (0.15).

> [!TIP]
> Insight 11B: NCX1 can serve as a basolateral Ca²⁺ extrusion pathway, but it requires an apical Ca²⁺ entry transporter, Na⁺ gradient support, and K⁺ balance.



------

# Lesson 12: Organic Solute Absorption and Secretion

**Estimated active time:** 15 minutes

## Learning Goals

By the end of this lesson, you should be able to:

- Apply epithelial polarity logic to organic solute transport.
- Distinguish organic solute absorption and secretion using net epithelial flux direction.
- Build an organic cation secretion layout using basolateral uptake and apical exit.
- Test whether reversing transporter polarity changes epithelial interpretation.
- Explain why organic anion secretion requires paired uptake and exit pathways.
- Explain why OAT-dependent organic anion uptake requires Na⁺/K⁺-ATPase support in SALT.

## New Transporters for This Lesson

In this lesson, you will work with four transporter classes that produce organic ion secretion.

**OCT** is an organic cation transporter. It facilitates the movement of organic cations across the membrane.

**MATE** is a multidrug and toxin extrusion transporter. It exchanges organic cations and H+ in opposite directions. 

**OAT** is an organic anion transporter. It is a tertiary active transporter that can move organic anions against their concentration gradient. In SALT, the tertiary intermediate ion isn't shown, but OAT activity is dependent on a Na⁺/K⁺-ATPase-supported gradient state.

**MRP/BCRP** is a class of pumps that use ATP to pump organic anions against their concentration gradients. MRP is the multidrug resistance-associated protein, and BCRP is the breast cancer resistance protein.

## Setup

Press the **Reset** button to remove any placed transporters.

Keep default settings for **Tissue** (All Transporters), **Paracellular Pathway** (Barrier), **Settings** (default ECF concentrations), and transporter densities (Normal).

Note that organic solute fluxes appear in a separate **Organic Ions** graph in the **Fluxes** tab. Use the **Mechanism** tab as your main evidence of transport, and use the **Fluxes** tab when you want a more quantitative check.

------

## Experiment 12A: OCT and MATE: Organic Cation Secretion

Epithelial cells can transport organic solutes, including metabolites, drugs, and waste products. The specific transporters are different from the ion and nutrient transporters you used earlier, but the epithelial logic is familiar.

A key epithelium that secretes organic solutes is the **renal proximal tubule**.

### Challenge

Build a simple layout that produces organic cation secretion using only OCT and MATE.

### Targets

Your final layout does not need to achieve cell balance, but it should:

- include net organic cation secretion,
- use Barrier as the paracellular pathway.



> [!NOTE]
> **Solution:**
>
> ```text
> Apical MATE
> Basolateral OCT
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> **Result:** Net OC+ secretion (-0.35) but with positive apical H+ flux (0.35). No intracellular imbalance, but with cell acidification.

> [!TIP]
> Insight 12A: Organic cation secretion requires paired basolateral uptake and apical exit steps, but MATE also causes intracellular acidification.

## Experiment 12B: Add Acid/Base Support

In Experiment 12A, you built a simplified organic cation secretory pathway. However, MATE is physiologically H+-coupled, so organic cation exit caused intracellular H+ accumulation. 

A more complete layout should therefore include the acid/base transport machinery that helps support the H+ gradient used by MATE.

### Challenge

Build a **proximal-tubule-like organic cation secretion** layout that minimized cell acidification.

Start with:

```text
Apical MATE
Basolateral OCT
(Barrier paracellular pathway, no background osmotic pull)
```

Then add transporters to support proximal-tubule-like acid/base handling and Na⁺ gradient maintenance. Add any combination of the transporters covered thus far in the lesson.

### Targets

Your final layout should:

- preserve organic cation secretion,
- support the H+ gradient context used by MATE,
- use Barrier as the paracellular pathway.

> [!NOTE]
> **Solution:**
>
> ```text
> Apical MATE
> Apical NHE3
> Basolateral OCT
> Basolateral NBC
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> OCT provides basolateral organic cation uptake. MATE provides apical organic cation exit into the lumen. NHE3 and NBC provide the proximal-tubule-like acid/base machinery that helps support the H+ context used by MATE. Na⁺/K⁺-ATPase supports the Na⁺ gradient needed for Na⁺-dependent transport, and basolateral Kir supports K⁺ recycling.
>

> [!TIP]
> Insight 12B: A more complete organic cation secretory layout integrates organic solute transport with acid/base transport and Na⁺ gradient support.

## Mini-Challenge 12: OAT and MRP/BCRP: Organic Anion Secretion

In Experiments 12A and 12B, you built organic cation secretion. Now apply the same epithelial secretion logic to a new solute class: **organic anions**.

This challenge adds a new support requirement.

In SALT, **OAT** represents organic anion uptake that is indirectly dependent on the Na⁺/K⁺-ATPase-supported gradient state. The exchanged intermediate ion is not shown. Instead, SALT simplifies the mechanism by requiring Na⁺/K⁺-ATPase support for OAT-dependent uptake.

### New transporter for this challenge

**MRP/BCRP** represents organic anion exit transporters. In this lesson, MRP/BCRP can provide apical organic anion exit into the lumen.

### Challenge

Build a simplified **renal proximal-tubule-like organic anion secretion** layout.

### Available transporters

Use only:

- OAT
- MRP/BCRP
- Na⁺/K⁺-ATPase
- Kir

Use **Barrier** as the paracellular pathway.

### Targets

Your final layout should:

- include organic anion uptake from the blood/interstitial side,
- include organic anion exit into the lumen,
- produce net epithelial organic anion secretion,
- include Na⁺/K⁺-ATPase support for OAT-dependent uptake,
- include K⁺ recycling or balancing if Na⁺/K⁺-ATPase creates a K⁺ imbalance.

Use the Results frame to inspect:

- organic anion flux across each membrane,
- net epithelial organic anion flux,
- Cell Gradient State,
- K⁺ fluxes and cell balance,
- any linked ion effects, if shown.

> [!NOTE]
> **Expected solution:**
>
> ```text
> Apical MRP/BCRP
> Basolateral OAT
> Basolateral Kir
> Basolateral Na⁺/K⁺-ATPase
> (Barrier paracellular pathway, no background osmotic pull)
> ```
>
> Basolateral OAT provides organic anion uptake from the blood/interstitial side. Apical MRP/BCRP provides organic anion exit into the lumen. Na⁺/K⁺-ATPase provides the pump-supported gradient state required for OAT in SALT. Basolateral Kir supports K⁺ recycling when Na⁺/K⁺-ATPase is active.

> [!TIP]
> Insight mini-challenge 12: The key transfer is that organic anion secretion uses the same paired-pathway logic as organic cation secretion, but OAT adds a support requirement: uptake depends on Na⁺/K⁺-ATPase-supported gradient logic.



---


# SALT Transporters and Settings

This reference lists the current selectable SALT settings for tissue context, paracellular pathway, and transporters by category.

## Tissue Settings

### All / Canvas

- All transporters

### Kidney and Urinary Tract

- Renal proximal tubule
- Thick ascending limb
- Distal convoluted tubule
- Connecting tubule / CNT
- Collecting duct principal cell
- Alpha-intercalated cell
- Beta-intercalated cell

### Gastrointestinal and Hepatobiliary

- Gastric parietal cell
- Small intestine
- Small intestinal crypt / secretory epithelium
- Colon absorptive epithelium
- Gallbladder epithelium

### Exocrine, Airway, and Skin

- Pancreatic duct
- Salivary duct
- Airway surface epithelium
- Sweat duct

### Central Nervous System

- Choroid plexus epithelium

### Reproductive System

- Placenta / syncytiotrophoblast exchange

## Paracellular Pathway Settings

- Barrier
- Cation + Water Pore
- Cation Pore
- Anion Pore

## Transporters by Category

### Pumps

- Na⁺/K⁺-ATPase
- H⁺-ATPase
- H⁺/K⁺-ATPase
- PMCA

### Channels

- AQP
- CFTR
- ClC
- ENaC
- GLUT
- Kir
- TRPV5/6

### Cotransporters

- Na⁺-AA
- NaPi 2:1
- NaPi 3:1
- NBC
- NCC
- NKCC
- PepT
- SGLT

### Exchangers

- CBE
- NCX1
- NHE3

### Organic Solute Carriers

- AA facilitator
- MATE
- MRP/BCRP
- OAT
- OCT
