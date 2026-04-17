import type { ConceptComponent, ConceptData } from './conceptEngine';

const CACHE_KEY = 'ai3d_model_cache';
const API_KEY_STORAGE = 'ai3d_gemini_api_key';

// Available shapes the Three.js viewer supports
const VALID_SHAPES: ConceptComponent['shape'][] = [
  'sphere', 'box', 'cylinder', 'cone', 'torus', 'ring',
  'plane', 'dodecahedron', 'octahedron', 'icosahedron',
  'tetrahedron', 'capsule'
];

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

function getCache(): Record<string, ConceptData> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

function setCache(key: string, data: ConceptData): void {
  try {
    const cache = getCache();
    cache[key.toLowerCase().trim()] = data;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

export function getCachedModel(concept: string): ConceptData | null {
  const cache = getCache();
  return cache[concept.toLowerCase().trim()] || null;
}

const SYSTEM_PROMPT = `You are a 3D model architect. Given a concept, you generate a detailed 3D model blueprint using geometric primitives.

AVAILABLE SHAPES: sphere, box, cylinder, cone, torus, ring, plane, dodecahedron, octahedron, icosahedron, tetrahedron, capsule

Each component has:
- name: descriptive label for the part
- description: what this part represents
- color: hex color string (e.g. "#ff4444")
- shape: one of the available shapes above
- position: [x, y, z] — center of scene is [0, 0, 0]
- scale: [x, y, z] — size multipliers (1 = unit size)
- rotation: [x, y, z] — rotation in radians (optional)
- emissive: hex color for glow effect (optional)
- metalness: 0-1 metallic look (optional)
- roughness: 0-1 surface roughness (optional)
- opacity: 0-1 transparency (optional)
- wireframe: boolean (optional)

RULES:
1. Create 6-20 components to build a RECOGNIZABLE representation of the concept
2. Use realistic proportions and spatial arrangement
3. Position components relative to each other to form the complete shape
4. Choose colors that match the real-world appearance
5. Use the scene center [0,0,0] as the model center
6. Keep the model within a bounding box of roughly -5 to 5 on each axis
7. Use overlapping/adjacent shapes creatively to suggest complex forms
8. Add a ground/base element when appropriate
9. Use transparency (opacity) for glass, water, air elements
10. Use emissive for glowing/light-emitting parts

EXAMPLE - "Rocket":
{
  "name": "Rocket",
  "category": "Engineering",
  "description": "A space rocket vehicle for launching payloads into orbit.",
  "detailedExplanation": "A rocket is a vehicle that obtains thrust from a rocket engine...",
  "cameraDistance": 8,
  "components": [
    {"name":"Nose Cone","description":"Aerodynamic tip","color":"#dddddd","shape":"cone","position":[0,3.5,0],"scale":[0.4,1,0.4],"metalness":0.7,"roughness":0.2},
    {"name":"Body","description":"Main fuel tank","color":"#cccccc","shape":"cylinder","position":[0,0.5,0],"scale":[0.6,2,0.6],"metalness":0.5},
    {"name":"Engine Bell","description":"Engine nozzle","color":"#aa8855","shape":"cone","position":[0,-1.2,0],"scale":[0.5,0.6,0.5],"metalness":0.8},
    {"name":"Fin 1","description":"Stabilizer","color":"#bbbbbb","shape":"box","position":[0.6,-0.8,0],"scale":[0.4,0.8,0.05],"rotation":[0,0,-0.2]},
    {"name":"Fin 2","description":"Stabilizer","color":"#bbbbbb","shape":"box","position":[-0.6,-0.8,0],"scale":[0.4,0.8,0.05],"rotation":[0,0,0.2]},
    {"name":"Exhaust","description":"Rocket exhaust","color":"#ff6600","shape":"cone","position":[0,-2.2,0],"scale":[0.4,1.2,0.4],"emissive":"#ff4400","opacity":0.7}
  ]
}

EXAMPLE - "House":
{
  "name": "House",
  "category": "Architecture",
  "description": "A residential building with walls, roof, door, and windows.",
  "detailedExplanation": "A house is a building designed for human habitation...",
  "cameraDistance": 8,
  "components": [
    {"name":"Walls","description":"Main structure","color":"#ddccbb","shape":"box","position":[0,0.5,0],"scale":[2.5,1.8,2],"roughness":0.8},
    {"name":"Roof","description":"Pitched roof","color":"#884433","shape":"cone","position":[0,2.2,0],"scale":[2,1,1.6]},
    {"name":"Door","description":"Front entrance","color":"#664422","shape":"box","position":[0,-0.1,-1.05],"scale":[0.5,0.9,0.05]},
    {"name":"Window Left","description":"Side window","color":"#88ccff","shape":"box","position":[-0.7,0.6,-1.05],"scale":[0.4,0.4,0.05],"opacity":0.6},
    {"name":"Window Right","description":"Side window","color":"#88ccff","shape":"box","position":[0.7,0.6,-1.05],"scale":[0.4,0.4,0.05],"opacity":0.6},
    {"name":"Chimney","description":"Smoke chimney","color":"#776655","shape":"box","position":[0.8,2.5,0.3],"scale":[0.25,0.7,0.25]},
    {"name":"Ground","description":"Lawn","color":"#448833","shape":"cylinder","position":[0,-0.5,0],"scale":[4,0.05,4],"roughness":1}
  ]
}

Respond with ONLY valid JSON matching the structure shown above. No markdown, no explanation, just the JSON object.`;

function buildUserPrompt(concept: string): string {
  return `Generate a detailed 3D model blueprint for: "${concept}"

Create a realistic, recognizable 3D representation using geometric primitives. Think carefully about what "${concept}" looks like and arrange the shapes to match its real appearance. Use appropriate colors, proportions, and spatial arrangement.

Respond with ONLY the JSON object.`;
}

function validateComponent(comp: unknown): ConceptComponent | null {
  if (!comp || typeof comp !== 'object') return null;
  const c = comp as Record<string, unknown>;

  if (typeof c.name !== 'string' || !c.name) return null;
  if (typeof c.color !== 'string' || !c.color.match(/^#[0-9a-fA-F]{6}$/)) return null;
  if (!VALID_SHAPES.includes(c.shape as ConceptComponent['shape'])) return null;
  if (!Array.isArray(c.position) || c.position.length !== 3) return null;
  if (!Array.isArray(c.scale) || c.scale.length !== 3) return null;

  const validated: ConceptComponent = {
    name: c.name as string,
    description: (typeof c.description === 'string' ? c.description : c.name) as string,
    color: c.color as string,
    shape: c.shape as ConceptComponent['shape'],
    position: c.position.map(Number) as [number, number, number],
    scale: c.scale.map(Number) as [number, number, number],
  };

  if (Array.isArray(c.rotation) && c.rotation.length === 3) {
    validated.rotation = c.rotation.map(Number) as [number, number, number];
  }
  if (typeof c.emissive === 'string' && c.emissive.match(/^#[0-9a-fA-F]{6}$/)) {
    validated.emissive = c.emissive;
  }
  if (typeof c.metalness === 'number' && c.metalness >= 0 && c.metalness <= 1) {
    validated.metalness = c.metalness;
  }
  if (typeof c.roughness === 'number' && c.roughness >= 0 && c.roughness <= 1) {
    validated.roughness = c.roughness;
  }
  if (typeof c.opacity === 'number' && c.opacity >= 0 && c.opacity <= 1) {
    validated.opacity = c.opacity;
  }
  if (typeof c.wireframe === 'boolean') {
    validated.wireframe = c.wireframe;
  }

  return validated;
}

function parseAIResponse(text: string, concept: string): ConceptData | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Remove markdown code fences if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.components) || parsed.components.length === 0) return null;

    const validComponents = parsed.components
      .map(validateComponent)
      .filter((c: ConceptComponent | null): c is ConceptComponent => c !== null);

    if (validComponents.length < 3) return null;

    const result: ConceptData = {
      name: typeof parsed.name === 'string' ? parsed.name :
        concept.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      category: typeof parsed.category === 'string' ? parsed.category : 'AI Generated',
      description: typeof parsed.description === 'string' ? parsed.description :
        `AI-generated 3D model of "${concept}".`,
      detailedExplanation: typeof parsed.detailedExplanation === 'string' ? parsed.detailedExplanation :
        `This is an AI-generated 3D visualization of "${concept}". The model was created by Google Gemini AI, which analyzed the concept and generated a blueprint using geometric primitives to create a recognizable representation.`,
      components: validComponents,
      tags: concept.toLowerCase().split(/\s+/),
      cameraDistance: typeof parsed.cameraDistance === 'number' ? parsed.cameraDistance : 8,
    };

    return result;
  } catch {
    return null;
  }
}

export interface AIGenerationResult {
  success: boolean;
  concept: ConceptData | null;
  error?: string;
  fromCache?: boolean;
}

export async function generateWithAI(concept: string): Promise<AIGenerationResult> {
  // Check cache first
  const cached = getCachedModel(concept);
  if (cached) {
    return { success: true, concept: cached, fromCache: true };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      concept: null,
      error: 'No API key configured. Open Settings to add your Gemini API key.'
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: SYSTEM_PROMPT + '\n\n' + buildUserPrompt(concept) }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = (errorData as Record<string, Record<string, string>>)?.error?.message || `API error: ${response.status}`;
      return { success: false, concept: null, error: errorMsg };
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        success: false,
        concept: null,
        error: 'Empty response from Gemini API.'
      };
    }

    const parsedModel = parseAIResponse(text, concept);

    if (!parsedModel) {
      return {
        success: false,
        concept: null,
        error: 'Failed to parse AI response into valid 3D model.'
      };
    }

    // Cache the result
    setCache(concept, parsedModel);

    return { success: true, concept: parsedModel };
  } catch (err) {
    return {
      success: false,
      concept: null,
      error: err instanceof Error ? err.message : 'Unknown error occurred.'
    };
  }
}
