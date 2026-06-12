// AUTO-GENERATED — run scripts/merge_scenario_packs.py after editing scenario packs
(function (global) {
  const WALK_FIELD_LOG_RULES = {
  "below-gate": [
    {
      "id": "offers-loaded",
      "description": "Feed was loaded near scenario",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "below-score",
      "description": "Intent score below allow bar (70)",
      "where": {
        "maxIntentScore": 69,
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "no-allow",
      "description": "No allow decision",
      "where": {
        "gateDecision": "allow"
      },
      "expect": {
        "none": true
      }
    }
  ],
  "walk-allow": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "walking-near-offers",
      "description": "On foot near seeded offers",
      "where": {
        "minOfferCount": 1,
        "activity": [
          "walking",
          "stationary",
          "unknown"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "lunch-corridor": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "lunch-walking",
      "description": "Midday walk near offers",
      "where": {
        "minOfferCount": 1,
        "activity": [
          "walking",
          "stationary",
          "unknown"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "driving-suppress": [
    {
      "id": "driving-hs05",
      "where": {
        "hardSuppressRule": "HS-05"
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "transit-suppress": [
    {
      "id": "transit-hs07",
      "description": "Transit hard suppress HS-07",
      "where": {
        "hardSuppressRule": "HS-07"
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "no-ping-transit",
      "description": "No surfaced alert while in transit",
      "where": {
        "surfaced": true,
        "activity": [
          "inTransit",
          "inVehicle",
          "driving"
        ]
      },
      "expect": {
        "none": true
      }
    }
  ],
  "quiet-allow": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 10
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "mall-walking",
      "description": "Dense ring while on foot",
      "where": {
        "minOfferCount": 10,
        "activity": [
          "walking",
          "stationary",
          "unknown"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "bootstrap-day3": [
    {
      "id": "bootstrap-lunch-walk",
      "description": "Day-3 lunch window walk with offers loaded",
      "where": {
        "minOfferCount": 1,
        "inLunchWindow": true,
        "activity": [
          "walking",
          "stationary",
          "unknown"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "parcel-run": [
    {
      "id": "parcel-walking",
      "description": "Errand walk with offers in ring",
      "where": {
        "minOfferCount": 1,
        "activity": [
          "walking",
          "stationary",
          "unknown"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "real-outing-walk": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "real-outing",
      "description": "Walk \u22655 min beyond anchor radius",
      "where": {
        "realOuting": true,
        "activity": "walking"
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "visit-wake": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "engagement-cooldown": [
    {
      "id": "offers-loaded",
      "description": "Feed loaded near scenario",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "engagement-defer-high-score",
      "description": "After feed/map engagement, gate defers even with score >= 70",
      "where": {
        "gateDecision": "defer",
        "minIntentScore": 70
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "no-delivery-while-deferred",
      "description": "No surfaced alert on engagement-cooldown defer rows",
      "where": {
        "gateDecision": "defer",
        "surfaced": true
      },
      "expect": {
        "none": true
      }
    }
  ],
  "map-engagement-cooldown": [
    {
      "id": "offers-loaded",
      "description": "Map loaded near scenario",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "engagement-defer-high-score",
      "description": "After map pan or pin tap, gate defers even with score >= 70",
      "where": {
        "gateDecision": "defer",
        "minIntentScore": 70
      },
      "expect": {
        "minMatches": 1
      }
    },
    {
      "id": "no-delivery-while-deferred",
      "description": "No surfaced alert on engagement-cooldown defer rows",
      "where": {
        "gateDecision": "defer",
        "surfaced": true
      },
      "expect": {
        "none": true
      }
    }
  ],
  "activity-wake": [
    {
      "id": "activity-wake",
      "description": "Activity change background wake",
      "where": {
        "wakeSource": "activity"
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "wifi-anchor-hint": [
    {
      "id": "wifi-hint",
      "description": "Known Wi\u2011Fi strengthens anchor",
      "where": {
        "wifiHint": [
          "matched",
          "departure"
        ]
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "car-to-walk": [
    {
      "id": "commute-to-walk",
      "description": "Walking after commute / car session",
      "where": {
        "commuteToWalk": true,
        "activity": "walking"
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "anchor-opportunity-ring": [
    {
      "id": "offer-radius-density",
      "description": "Enough offers inside user offer-radius setting",
      "where": {
        "offerRadiusDensityMet": true
      },
      "expect": {
        "minMatches": 1
      }
    }
  ],
  "commute-corridor": [
    {
      "id": "offers-loaded",
      "where": {
        "minOfferCount": 1
      },
      "expect": {
        "minMatches": 1
      }
    }
  ]
};
  const WALK_ENGINE_PASS_IF_ANY = {
  "walk-allow": [
    {
      "id": "delivery-path",
      "description": "Would deliver OR allow score \u2265 70",
      "rules": [
        {
          "id": "would-deliver",
          "where": {
            "wouldDeliver": true,
            "activity": [
              "walking",
              "stationary",
              "unknown"
            ]
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "allow-band",
          "where": {
            "gateDecision": "allow",
            "minIntentScore": 70,
            "activity": [
              "walking",
              "stationary",
              "unknown"
            ]
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ],
  "lunch-corridor": [
    {
      "id": "lunch-window",
      "description": "mealCorridor lunch OR inLunchWindow",
      "rules": [
        {
          "id": "meal-lunch",
          "where": {
            "mealCorridor": "lunch"
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "in-lunch",
          "where": {
            "inLunchWindow": true
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ],
  "quiet-allow": [
    {
      "id": "quiet-or-deliver",
      "description": "Would deliver (quiet or ping) OR allow score \u2265 70",
      "rules": [
        {
          "id": "would-deliver",
          "where": {
            "wouldDeliver": true,
            "activity": [
              "walking",
              "stationary",
              "unknown"
            ]
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "allow-quiet",
          "where": {
            "gateDecision": "allow",
            "minIntentScore": 70,
            "activity": [
              "walking",
              "stationary",
              "unknown"
            ]
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ],
  "bootstrap-day3": [
    {
      "id": "bootstrap-score-or-deliver",
      "description": "Row 17 boost visible OR allow/deliver during lunch walk",
      "rules": [
        {
          "id": "allow-lunch",
          "where": {
            "gateDecision": "allow",
            "minIntentScore": 60,
            "inLunchWindow": true
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "would-deliver-lunch",
          "where": {
            "wouldDeliver": true,
            "inLunchWindow": true
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ],
  "visit-wake": [
    {
      "id": "visit-or-slot",
      "description": "Visit wake OR learned slot strength",
      "rules": [
        {
          "id": "visit-wake",
          "where": {
            "wakeSource": "visit"
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "learned-slot",
          "where": {
            "minSlotStrength": 0.5
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ],
  "commute-corridor": [
    {
      "id": "commute-or-station",
      "description": "On-route on-time OR station cluster",
      "rules": [
        {
          "id": "on-route",
          "where": {
            "onRouteOnTime": true
          },
          "expect": {
            "minMatches": 1
          }
        },
        {
          "id": "station-cluster",
          "where": {
            "nearStationCluster": true
          },
          "expect": {
            "minMatches": 1
          }
        }
      ]
    }
  ]
};

  function num(entry, key) {
    const raw = entry[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function boolVal(entry, key) {
    const raw = entry[key];
    return typeof raw === "boolean" ? raw : null;
  }

  function strVal(entry, key) {
    const raw = entry[key];
    return raw == null ? null : String(raw);
  }

  function asStringArray(value) {
    if (value == null) return null;
    return Array.isArray(value) ? value : [value];
  }

  function entryMatchesFilter(entry, filter) {
    if (!filter) return true;
    const gate = asStringArray(filter.gateDecision);
    if (gate && !gate.includes(strVal(entry, "gateDecision") ?? "")) return false;
    const wake = asStringArray(filter.wakeSource);
    if (wake && !wake.includes(strVal(entry, "wakeSource") ?? "")) return false;
    const place = asStringArray(filter.placeKind);
    if (place && !place.includes(strVal(entry, "placeKind") ?? "")) return false;
    const slot = asStringArray(filter.slotKind);
    if (slot && !slot.includes(strVal(entry, "slotKind") ?? "")) return false;
    const activity = asStringArray(filter.activity);
    if (activity && !activity.includes(strVal(entry, "activity") ?? "")) return false;
    const hs = asStringArray(filter.hardSuppressRule);
    if (hs && !hs.includes(strVal(entry, "hardSuppressRule") ?? "")) return false;
    const why = asStringArray(filter.suppressReason);
    if (why && !why.includes(strVal(entry, "suppressReason") ?? "")) return false;

    const offerCount = num(entry, "offerCount");
    if (filter.minOfferCount != null && (offerCount == null || offerCount < filter.minOfferCount)) return false;
    if (filter.maxOfferCount != null && (offerCount == null || offerCount > filter.maxOfferCount)) return false;
    const opp = num(entry, "opportunitySum");
    if (filter.minOpportunitySum != null && (opp == null || opp < filter.minOpportunitySum)) return false;
    if (filter.maxOpportunitySum != null && (opp == null || opp > filter.maxOpportunitySum)) return false;
    const score = num(entry, "intentScore");
    if (filter.minIntentScore != null && (score == null || score < filter.minIntentScore)) return false;
    if (filter.maxIntentScore != null && (score == null || score > filter.maxIntentScore)) return false;
    const strength = num(entry, "slotStrength");
    if (filter.minSlotStrength != null && (strength == null || strength < filter.minSlotStrength)) return false;
    if (filter.maxSlotStrength != null && (strength == null || strength > filter.maxSlotStrength)) return false;

    for (const key of [
      "memoryColdStart", "memoryNewArea", "anchorEnter", "anchorExit",
      "surfaced", "wouldDeliver", "realOuting", "inLunchWindow",
      "onRouteOnTime", "nearStationCluster", "carToWalk", "insideRingFromAnchor",
    ]) {
      if (key in filter && boolVal(entry, key) !== filter[key]) return false;
    }

    const wifiHint = asStringArray(filter.wifiHint);
    if (wifiHint && !wifiHint.includes(strVal(entry, "wifiHint") ?? "")) return false;
    const lunchWindow = asStringArray(filter.lunchWindow);
    if (lunchWindow && !lunchWindow.includes(strVal(entry, "lunchWindow") ?? "")) return false;
    const mealCorridor = asStringArray(filter.mealCorridor);
    if (mealCorridor && !mealCorridor.includes(strVal(entry, "mealCorridor") ?? "")) return false;
    return true;
  }

  function evaluateSingleRule(entries, rule) {
    const matches = entries.filter((e) => entryMatchesFilter(e, rule.where));
    const count = matches.length;
    const expect = rule.expect || {};
    const none = !!expect.none;
    const min = expect.minMatches ?? (none ? 0 : 1);
    const max = expect.maxMatches;
    let pass = false;
    let detail = "";
    if (none) {
      pass = count === 0;
      detail = pass ? "no matching entries (expected)" : `${count} forbidden match(es)`;
    } else {
      pass = count >= min && (max == null || count <= max);
      detail = `${count} match(es) (need ≥${min}${max != null ? `, ≤${max}` : ""})`;
    }
    return {
      id: rule.id,
      pass,
      detail: rule.description || detail,
      matchCount: count,
      layer: "engine",
    };
  }

  function evaluateEngineRules(entries, scenarioId, customRules, orGroups) {
    const rules = customRules && customRules.length
      ? customRules
      : WALK_FIELD_LOG_RULES[scenarioId] || [];
    const checks = rules.map((rule) => evaluateSingleRule(entries, rule));
    const groups = orGroups != null
      ? orGroups
      : WALK_ENGINE_PASS_IF_ANY[scenarioId] || [];
    for (const group of groups) {
      const subRules = group.rules || [];
      const subChecks = subRules.map((r) => evaluateSingleRule(entries, r));
      const ok = subChecks.some((c) => c.pass);
      const passedIds = subChecks.filter((c) => c.pass).map((c) => c.id);
      checks.push({
        id: group.id || "engine_or",
        pass: ok,
        detail: group.description || `one of ${subRules.map((r) => r.id).join(", ")} (${passedIds.join(", ") || "none"})`,
        matchCount: passedIds.length,
        layer: "engine_or",
      });
    }
    return checks;
  }

  function evaluateMemoryTraceRules(memoryTrace, rules) {
    const trace = memoryTrace || {};
    const strong = Number(trace.strong_slot_count || 0);
    const diary = Number(trace.diary_event_count || 0);
    return (rules || []).map((rule) => {
      let ok = true;
      const parts = [];
      if (rule.minStrongSlots != null) {
        ok = ok && strong >= rule.minStrongSlots;
        parts.push(`strong_slots=${strong} (need ≥${rule.minStrongSlots})`);
      }
      if (rule.minDiaryEvents != null) {
        ok = ok && diary >= rule.minDiaryEvents;
        parts.push(`diary=${diary} (need ≥${rule.minDiaryEvents})`);
      }
      return {
        id: rule.id || "memory_trace",
        pass: ok,
        detail: rule.description || parts.join("; "),
        layer: "memory_trace",
      };
    });
  }

  global.FieldLogEngine = {
    WALK_FIELD_LOG_RULES,
    WALK_ENGINE_PASS_IF_ANY,
    entryMatchesFilter,
    evaluateEngineRules,
    evaluateMemoryTraceRules,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
