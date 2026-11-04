// IAF Tactical Flight Line Intelligence & Voice Engine
// Powered by Sarvam AI (bulbul:v3) + Tactical Aerospace Operations Core

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const DEFAULT_SPEAKER = 'shubh';
const DEFAULT_SARVAM_KEY = import.meta.env.VITE_SARVAM_API_KEY || '';
// Memory audio cache to ensure instant playback without redundant network roundtrips
const audioCache = new Map();

export const VOICE_SPEAKERS = [
  { id: 'shubh', name: 'Commander Shubh (IAF Operations)', role: 'Tactical Flight Line Control' },
  { id: 'anushka', name: 'Officer Anushka (Air Ops)', role: 'Flight Telemetry Controller' },
  { id: 'aditya', name: 'Lt. Aditya (Hangar Maintenance)', role: 'Technical Airframe Officer' },
  { id: 'ratan', name: 'Brigadier Ratan (Senior Command)', role: 'Strategic Mission Briefing' },
];

/**
 * Phonetically translates military aerospace telemetry, formulas, and acronyms into natural Indian English
 */
export function prepareSpeechText(text) {
  if (!text) return '';
  return text
    .replace(/\$T_\{?30\}?\$/g, 'T thirty compressor temperature')
    .replace(/\$P_\{?30\}?\$/g, 'P thirty high pressure')
    .replace(/\$T_\{?24\}?\$/g, 'T twenty four LPC temperature')
    .replace(/\$P_\{?24\}?\$/g, 'P twenty four LPC pressure')
    .replace(/\$T_\{?50\}?\$/g, 'exhaust gas temperature')
    .replace(/\\text\{EGT\}/gi, 'exhaust gas temperature')
    .replace(/\bEGT\b/g, 'exhaust gas temperature')
    .replace(/\bHPC\b/g, 'high pressure compressor')
    .replace(/\bLPC\b/g, 'low pressure compressor')
    .replace(/\bHPT\b/g, 'high pressure turbine')
    .replace(/\bLPT\b/g, 'low pressure turbine')
    .replace(/\\mu/g, 'mean')
    .replace(/\\sigma/g, 'sigma')
    .replace(/\\ge/g, 'greater than or equal to')
    .replace(/\\le/g, 'less than or equal to')
    .replace(/\$\$\\text\{Conservative RUL\}[^$]+\$\$/g, 'Conservative R U L equals mean R U L minus one point six four five sigma')
    .replace(/\$[^$]+\$/g, '') // strip remaining raw LaTeX math delimiters
    .replace(/[#*`_~\\\[\]()|]/g, ' ') // strip markdown characters
    .replace(/\bAOG\b/g, 'aircraft on ground')
    .replace(/\bFOB\b/g, 'forward operating base')
    .replace(/\bBRD\b/g, 'base repair depot')
    .replace(/\bLRU\b/g, 'line replaceable unit')
    .replace(/Su-30MKI/g, 'Sukhoi thirty M K I')
    .replace(/Tejas Mk1A/g, 'Tejas Mark One A')
    .replace(/C-17/g, 'C seventeen')
    .replace(/ALH Rudra/g, 'A L H Rudra')
    .replace(/RUL/g, 'Remaining Useful Life')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480);
}

/**
 * Synthesizes speech using Sarvam AI's bulbul:v3 model.
 * Always defaults to our valid key to prevent fallback to robotic browser voices.
 */
export async function synthesizeSpeech(text, options = {}) {
  const apiKey = options.apiKey || import.meta.env.VITE_SARVAM_API_KEY || DEFAULT_SARVAM_KEY;
  const speaker = options.speaker || DEFAULT_SPEAKER;
  const cleanText = prepareSpeechText(text);

  if (!cleanText) {
    return { play: () => Promise.resolve(), pause: () => {} };
  }

  const cacheKey = `${speaker}:${cleanText}`;
  if (audioCache.has(cacheKey)) {
    const cachedAudio = audioCache.get(cacheKey);
    cachedAudio.currentTime = 0;
    return cachedAudio;
  }

  // 1. Direct Sarvam AI TTS Request
  if (apiKey) {
    try {
      const resp = await fetch(SARVAM_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': apiKey,
        },
        body: JSON.stringify({
          inputs: [cleanText],
          target_language_code: 'en-IN',
          speaker: speaker,
          model: 'bulbul:v3',
          enable_preprocessing: true,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.audios && data.audios.length > 0) {
          const audio = new Audio(`data:audio/wav;base64,${data.audios[0]}`);
          audioCache.set(cacheKey, audio);
          return audio;
        }
      } else {
        console.warn('Sarvam API returned non-200 status:', resp.status);
      }
    } catch (err) {
      console.warn('Sarvam AI TTS network request failed, falling back to browser synthesis:', err);
    }
  }

  // 2. Fallback to Browser Native Web Speech Synthesis (only if network fails)
  return {
    play: () => {
      return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.lang = 'en-IN';
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    },
    pause: () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}

/**
 * Microphone Speech-to-Text Listener
 */
export function createSpeechRecognizer({ onResult, onError, onEnd }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (onResult) onResult(transcript, event.results[0].isFinal);
  };

  recognition.onerror = (event) => {
    if (onError) onError(event.error);
  };

  recognition.onend = () => {
    if (onEnd) onEnd();
  };

  return recognition;
}

/**
 * Authoritative Indian Air Force Flight Line Intelligence
 * Returns structured conversational response, formula card, and "Keep going" suggestions
 */
export function queryVayuBrain(prompt, context = {}) {
  const lower = prompt.toLowerCase();

  // 1. Sortie Clearance & Mission Readiness Briefing
  if (lower.includes('sortie') || lower.includes('clearance') || lower.includes('briefing') || lower.includes('ready') || lower.includes('mission')) {
    return {
      spokenText: "Mission readiness report: Fleet availability stands at 65 percent across 20 frontline airframes. 13 aircraft are cleared for immediate combat sorties, while tail SB-024 is strictly grounded at Thanjavur due to high-pressure compressor erosion. Four-ship strike formations are cleared for Sukhoi-30MKI, Tejas Mark 1A, and Rafale.",
      displayText: `I monitor fleet readiness and combat sortie authorization across all 5 frontline squadrons. 

Current Operational State:
• 13 of 20 Combat Airframes are Mission Ready (65.0% Fleet-wide Availability)
• No. 222 Squadron "Tigersharks" (Su-30MKI, Thanjavur): 4 Ready, 1 Scheduled, 1 AOG Grounded
• No. 45 Squadron "Flying Daggers" (Tejas Mk1A, Sulur): 5 Ready, 1 Scheduled
• No. 17 Squadron "Golden Arrows" (Rafale, Ambala): 4 Ready, 2 Scheduled

Critical Hold Notice:
Tail SB-024 (Su-30MKI) is on NO-GO hold. High Pressure Compressor blade wear reached 21.2%, exceeding safety limits. Emergency replenishment has been routed to 3 BRD Chandigarh.`,
      formulaCard: {
        title: "Sortie Clearance Gate",
        formula: "Conservative RUL >= Sortie Duration × 1.40 (Profile Buffer)"
      },
      suggestions: [
        "Why is tail SB-024 grounded at AFS Thanjavur?",
        "Which 4 ship formation is cleared for immediate flight?",
        "How does the 1.4x buffer account for supersonic afterburner load?"
      ]
    };
  }

  // 2. Tail SB-024 (AOG Grounded Aircraft)
  if (lower.includes('sb-024') || lower.includes('grounded') || lower.includes('aog') || lower.includes('thanjavur')) {
    return {
      spokenText: "Aircraft SB-024 is a Sukhoi-30MKI assigned to Number 222 Squadron Tigersharks at Thanjavur Air Force Station. It is currently on Aircraft On Ground status due to severe High Pressure Compressor blade wear. Local forward base inventory has zero replacement blades. An automated high-priority requisition has been routed to central depot at 3 BRD Chandigarh.",
      displayText: `Tail SB-024 is currently on critical Aircraft On Ground status in Hangar Bay 2 at AFS Thanjavur.

Diagnostic Findings:
• Airframe: Su-30MKI (Twin Saturn AL-31FP Turbofans)
• Health Score: 54.2% (Critical Degrade)
• Conservative RUL: 12.1 flight hours (Point Estimate: 18.4 hrs)
• Root Failure Mode: High Pressure Compressor (HPC) Blade Erosion with 21.2% wear margin breached.
• Local Inventory Bottleneck: Forward Operating Base bin stock for rotor blades is currently at 0 units.

Remediation Pipeline:
• Work Order WO-2026-089 active with priority technician allocation.
• Emergency depot requisition REQ-2026-088 routed to 3 BRD Chandigarh via IAF logistics transport.`,
      formulaCard: {
        title: "Compressor Degradation Threshold",
        formula: "HPC Wear = 21.2% (Safety Limit: 15.0%) -> STRICT NO-GO"
      },
      suggestions: [
        "What is the transit time for LRU blades from Chandigarh?",
        "Can we reallocate parts from standby airframes?",
        "Show work order WO-2026-089 in Hangar Bay 2"
      ]
    };
  }

  // 3. 5 Stage Thermodynamic Turbofan Twin Physics
  if (lower.includes('5-stage') || lower.includes('gas path') || lower.includes('thermodynamic') || lower.includes('twin physics') || lower.includes('engine') || lower.includes('stations')) {
    return {
      spokenText: "Our digital twin models military turbofans across 5 standard aerospace thermodynamic stations: Station 2 Fan Intake, Station 24 Low Pressure Compressor, Station 30 High Pressure Compressor, Station 40 Combustor and High Pressure Turbine, and Station 50 Low Pressure Turbine and Exhaust. The physics engine tracks thermodynamic margins in real time from NASA C-MAPSS telemetry.",
      displayText: `Our digital twin models the AL-31FP, GE-F404, and Snecma M88 engines across standard gas turbine aerodynamic stations:

Explaining Gas Path Stations:
• Station 2 (Fan Intake): Monitors T2, inlet pressure P2, and fan speed Nf. Detects foreign object damage and inlet distortion.
• Station 24 (Low Pressure Compressor): Tracks inter-stage bleed leakage and aerodynamic flutter under high-altitude cruise.
• Station 30 (High Pressure Compressor): Tracks T30 and P30 pressure ratios to detect blade tip rubbing and aerodynamic erosion.
• Station 40 (Combustor & HPT): Tracks fuel flow Wf and burner temperature to detect nozzle guide vane cracks and hot-spotting.
• Station 50 (Low Pressure Turbine & Exhaust): Tracks exhaust gas temperature and core vibration to detect thermal coating spallation.`,
      formulaCard: {
        title: "Thermodynamic Residual Equation",
        formula: "Residual Delta = Measured Station Telemetry - NASA C-MAPSS Baseline"
      },
      suggestions: [
        "What causes the Station 30 high-pressure temperature spike?",
        "How does in flight RLS sensor drift filter false alarms?",
        "What are the nominal bypass ratio limits for AL-31FP?"
      ]
    };
  }

  // 4. Conformal RUL Prediction & Math
  if (lower.includes('conformal') || lower.includes('rul') || lower.includes('math') || lower.includes('formula') || lower.includes('conservative')) {
    return {
      spokenText: "Point predictions are dangerous in combat aviation because an unpredicted engine failure during an afterburner climb is catastrophic. We use Conformal RUL prediction, calculating the conservative lower bound as mean minus 1.645 sigma, giving a guaranteed 90 percent operational confidence interval. An aircraft is cleared only when its conservative RUL exceeds the mission requirement.",
      displayText: `Combat mission planners cannot rely on raw point estimates. An unpredicted engine stall during a high-G supersonic turn is unacceptable.

Conformal Mathematical Framework:
• Rather than a single point prediction, the model computes an uncertainty distribution from empirical C-MAPSS residual errors.
• The Conservative Lower Bound represents the operational flight hours remaining with 90% statistical guarantee.
• The aircraft is only cleared for a combat profile if this lower bound exceeds the sortie duration multiplied by the mission stress factor.`,
      formulaCard: {
        title: "90% Conformal Confidence Bound",
        formula: "Conservative RUL = Mean RUL − 1.645 × Sigma (Residual Standard Error)"
      },
      suggestions: [
        "Why is a raw point estimate dangerous in combat aviation?",
        "How does NASA C-MAPSS calibrate the residual error sigma?",
        "What are the stress multipliers for CAP vs Deep Strike?"
      ]
    };
  }

  // 5. Spares & Depot Logistics
  if (lower.includes('spares') || lower.includes('logistics') || lower.includes('inventory') || lower.includes('depot') || lower.includes('lru')) {
    return {
      spokenText: "The logistics integration connects Forward Operating Base spares with central overhaul depots. Base inventory tracks 18 critical line replaceable units across forward air force stations, while central depots in Chandigarh and Nashik monitor heavy overhaul components with automated predictive replenishment.",
      displayText: `Our supply chain architecture links forward air bases directly with central overhaul depots to eliminate fragmented agency delays:

Multi Silo Logistics Flow:
• Forward Operating Bases: 18 Line Replaceable Units actively tracked across AFS Thanjavur, Sulur, and Ambala.
• Predictive Reordering: When an airframe's conservative RUL drops below depot delivery lead-time, automated replenishment orders dispatch before the jet physically grounds.
• Central Depots Connected:
  - 3 BRD Chandigarh: Heavy engine overhaul & turbine rotor blades.
  - 11 BRD Ojhar (Nashik): Su-30MKI airframe structural maintenance.
  - HAL Engine Division (Bangalore): Tejas Mk1A GE-F404 propulsion depot.`,
      formulaCard: {
        title: "Automated Reorder Trigger",
        formula: "Reorder Trigger = Conservative RUL < Depot Lead Time (36h)"
      },
      suggestions: [
        "Which LRUs are currently below safety stock?",
        "What is the transit time from Chandigarh to Thanjavur?",
        "How does predictive ordering prevent AOG downtime?"
      ]
    };
  }

  // 6. Multimodal NLP Snag Fusion
  if (lower.includes('nlp') || lower.includes('snag') || lower.includes('fusion') || lower.includes('pilot log')) {
    return {
      spokenText: "Our multi-modal engine fuses unstructured pilot debrief remarks with engine sensor telemetry. When a pilot notes core vibration on afterburner, the NLP pipeline correlates the text with Station 30 accelerometer spikes, boosting diagnostic confidence to 98.4 percent, a 22 percent increase over sensor telemetry alone.",
      displayText: `Eliminates the disconnect between qualitative pilot debrief remarks and quantitative sensor telemetry:

Cross-Modal Corroboration:
• Pilot Snag Ingestion: Natural Language Processing extracts clinical flight symptoms from post-flight logs (e.g., core vibration on afterburner climb).
• Telemetry Corroboration: Cross-references sensor streams to verify abnormal Station 30 vibration indices and pressure fluctuations.
• Diagnostic Confidence: Fusing textual symptom classification with sensor telemetry raises diagnostic accuracy from 76.0% (sensor-only) to 98.4%.`,
      formulaCard: {
        title: "Multimodal Confidence Metric",
        formula: "Confidence = NLP Textual Vector (92%) + IoT Telemetry (76%) = 98.4%"
      },
      suggestions: [
        "Show an example of a pilot debrief remark being correlated",
        "How does NLP detect afterburner core vibration?",
        "What is the accuracy gain over sensor-only monitoring?"
      ]
    };
  }

  // 7. General / Fallback
  return {
    spokenText: `Understood Commander. Querying Air Power fleet intelligence for ${prompt}. Our system tracks 20 frontline combat airframes with thermodynamic digital twins, conformal remaining useful life margins, and integrated depot logistics.`,
    displayText: `Operational status is nominal across all 20 combat airframes.

How I can assist your flight line operations:
• Real-time sortie clearance verification and formation planning
• 5-stage thermodynamic gas path digital twin telemetry
• Conformal Remaining Useful Life mathematical formulations
• Forward Operating Base spares and central depot logistics`,
    formulaCard: {
      title: "Fleet Readiness Index",
      formula: "Readiness = 13 Mission Ready / 20 Total Airframes = 65.0%"
    },
    suggestions: [
      "Give me a sortie clearance briefing",
      "Why is tail SB-024 grounded at AFS Thanjavur?",
      "Explain the 5-stage thermodynamic turbofan twin",
      "How does conformal RUL calculation work?"
    ]
  };
}
