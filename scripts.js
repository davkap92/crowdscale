// Global variables
let scene, camera, renderer, controls;
let stadiums = [];
let stadiumInstances = []; // Track InstancedMesh objects for cleanup
const STADIUM_CAPACITY = 100000; // Each stadium represents 100,000 people
const STADIUM_SPACING = 500; // Space between stadiums
const GRID_SIZE = 20; // Increased maximum stadiums per row for larger grids
const MAX_RENDERED_STADIUMS = 10000;
const WHITE_INSTANCE_COLOR = new THREE.Color(0xffffff);
const labelWorldPosition = new THREE.Vector3();
const labelCameraPosition = new THREE.Vector3();
const keyboardForward = new THREE.Vector3();
const keyboardRight = new THREE.Vector3();
const keyboardForwardXZ = new THREE.Vector3();
const keyboardMoveDirection = new THREE.Vector3();
const STADIUM_DETAIL_LEVELS = {
    HIGH: 0,    // Full detail for close stadiums
    MEDIUM: 1,  // Medium detail for medium distance
    LOW: 2      // Low detail for far stadiums
};

// Keyboard movement controls
const keyState = {
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false
};
const MOVEMENT_SPEED = 30;  // Base movement speed
const SPRINT_MULTIPLIER = 3; // Speed multiplier when shift is pressed

// Stadium template geometries and materials for instancing
let stadiumGeometries = {};
let stadiumMaterials = {};
let crowdTexture; // Single crowd texture
let templatesReady = false;
let pendingPeopleCount = null;
let lastFrameTime = 0;

// Initialize the 3D scene
function initScene() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // Create camera
    camera = new THREE.PerspectiveCamera(
        60, // Field of view
        document.getElementById('visualization-container').clientWidth / 
        document.getElementById('visualization-container').clientHeight, // Aspect ratio
        0.1, // Near clipping plane
        15000 // Far clipping plane - increased for large scenes
    );
    camera.position.set(600, 400, 600);
    camera.lookAt(0, 0, 0);
    
    // Create renderer with optimized settings - MUST CREATE RENDERER BEFORE USING ITS CAPABILITIES
    renderer = new THREE.WebGLRenderer({ 
        antialias: false, // Disable antialiasing for performance
        powerPreference: 'high-performance'
    });
    renderer.setSize(
        document.getElementById('visualization-container').clientWidth,
        document.getElementById('visualization-container').clientHeight
    );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFShadowMap; // Softer shadow edges
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic color grading
    renderer.toneMappingExposure = 1.0;
    
    // Add renderer to DOM
    document.getElementById('visualization-container').appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below ground by keeping angle away from PI/2
    controls.minDistance = 100; // Prevent zooming too close
    controls.maxDistance = 12000; // Limit maximum zoom out
    controls.enablePan = true; // Allow panning
    controls.screenSpacePanning = true; // Use screen space panning for more intuitive controls
    controls.autoRotate = false; // No auto-rotation by default
    controls.autoRotateSpeed = 0.5; // In case auto-rotation is enabled later
    
    // Hemisphere light provides natural sky/ground color bounce
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x4ca64c, 0.6);
    scene.add(hemisphereLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xfffde7, 1.0); // Warm sunlight
    directionalLight.position.set(500, 1000, 500);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512; // Reduced for performance
    directionalLight.shadow.mapSize.height = 512; // Reduced for performance
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 3000;
    directionalLight.shadow.camera.left = -1500;
    directionalLight.shadow.camera.right = 1500;
    directionalLight.shadow.camera.top = 1500;
    directionalLight.shadow.camera.bottom = -1500;
    scene.add(directionalLight);
    
    // We'll create the ground plane later in createStadiums() to make it fit the stadiums
    
    // Add grid helper - simplified
    const gridHelper = new THREE.GridHelper(10000, 25, 0x000000, 0x000000);
    gridHelper.position.y = 0.1; // Slightly above ground to prevent z-fighting
    gridHelper.name = "initialGrid"; // Give it a name so we can remove it later
    scene.add(gridHelper);

    // Fog matching sky color for seamless horizon blending
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.00015);
    
    // Load crowd texture - a realistic crowd image
    loadCrowdTexture().then(() => {
        // Pre-create stadium geometries and materials for different detail levels
        createStadiumTemplates();
        templatesReady = true;
        
        // Initialize with default value after textures are loaded
        const defaultPeopleCount = pendingPeopleCount || parseInt(document.getElementById('people-count').value, 10);
        pendingPeopleCount = null;
        createStadiums(defaultPeopleCount);
    });

    // Add keyboard controls for WASD flying
    setupKeyboardControls();
}

// Load the crowd texture from a URL
function loadCrowdTexture() {
    return new Promise((resolve) => {
        // Generate a procedural crowd texture on a canvas — no network/CORS issues
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Dark concrete/seat base
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(0, 0, size, size);

        // Crowd palette — realistic stadium clothing colours
        const colours = [
            '#e63946','#d62839','#c1121f', // reds
            '#1d3557','#457b9d','#a8dadc', // blues
            '#f4a261','#e76f51','#e9c46a', // oranges/yellows
            '#2a9d8f','#264653',           // teals
            '#ffffff','#f1faee',           // whites
            '#6d6875','#b5838d',           // purples
            '#606c38','#dda15e',           // greens/tans
        ];

        const rowCount  = 28;   // horizontal seating rows
        const colCount  = 52;   // seats per row
        const headW     = size / colCount;
        const rowH      = size / rowCount;

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const cx = (col + 0.5) * headW + (row % 2 === 0 ? 0 : headW * 0.5);
                const cy = (row + 0.5) * rowH;

                // Pick a random shirt colour, weighted towards the seat colour
                const colour = colours[Math.floor(Math.random() * colours.length)];

                // Torso / body
                ctx.fillStyle = colour;
                const bodyW = headW * 0.72;
                const bodyH = rowH * 0.55;
                ctx.beginPath();
                ctx.ellipse(cx, cy + rowH * 0.18, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
                ctx.fill();

                // Head — skin tones
                const skinTones = ['#f5cba7','#e8b88a','#d4956a','#c07850','#8d5524','#5c3317'];
                ctx.fillStyle = skinTones[Math.floor(Math.random() * skinTones.length)];
                const headR = headW * 0.25;
                ctx.beginPath();
                ctx.arc(cx, cy - rowH * 0.1, headR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Subtle row-separator lines to define seating tiers
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        for (let row = 1; row < rowCount; row++) {
            ctx.beginPath();
            ctx.moveTo(0, row * rowH);
            ctx.lineTo(size, row * rowH);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(6, 2);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        if (renderer && renderer.capabilities) {
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        }

        crowdTexture = texture;
        resolve();
    });
}

// Pre-create stadium geometries and materials for efficiency
function createStadiumTemplates() {
    // Make sure crowd texture is loaded
    if (!crowdTexture) {
        console.warn('Crowd texture not loaded yet, using fallback color');
    }
    
    // Define shared materials to reduce material count
    stadiumMaterials = {
        base: new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
            metalness: 0.3
        }),
        bowl: new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.8,
            metalness: 0.2,
            side: THREE.DoubleSide
        }),
        field: new THREE.MeshStandardMaterial({
            color: 0x003d00,
            roughness: 0.9,
            metalness: 0.0
        }),
        pole: new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.7,
            metalness: 0.5
        }),
        fixture: new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.5
        }),
        crowd: new THREE.MeshStandardMaterial({
            map: crowdTexture || null,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.BackSide,
            emissive: 0x111111,
            emissiveIntensity: 0.15,
            color: 0xffffff, // White so the canvas texture colours render accurately
        })
    };

    // Create high detail geometries
    stadiumGeometries.high = {
        base: new THREE.CylinderGeometry(100, 110, 20, 32),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 32, 5, true),
        field: new THREE.CircleGeometry(70, 32),
        stands: new THREE.CylinderGeometry(95, 78, 30, 32, 16, true),
        pole: new THREE.CylinderGeometry(1, 1, 80, 6),
        fixture: new THREE.BoxGeometry(10, 5, 10)
    };
    
    // Create medium detail geometries
    stadiumGeometries.medium = {
        base: new THREE.CylinderGeometry(100, 110, 20, 16),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 16, 3, true),
        field: new THREE.CircleGeometry(70, 16),
        stands: new THREE.CylinderGeometry(95, 78, 30, 16, 8, true),
        pole: new THREE.CylinderGeometry(1, 1, 80, 4),
        fixture: new THREE.BoxGeometry(10, 5, 10)
    };
    
    // Create low detail geometries
    stadiumGeometries.low = {
        base: new THREE.CylinderGeometry(100, 110, 20, 8),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 8, 1, true),
        field: new THREE.CircleGeometry(70, 8),
        stands: new THREE.CylinderGeometry(95, 78, 30, 8, 4, true),
        pole: null, // No poles for low detail
        fixture: null // No fixtures for low detail
    };
}

function disposeSceneObject(object) {
    scene.remove(object);
    if (object.geometry) {
        object.geometry.dispose();
    }

    if (object.material) {
        if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
        } else {
            object.material.dispose();
        }
    }
}

// Create a stadium with the appropriate level of detail
function createStadiumModel(detailLevel = STADIUM_DETAIL_LEVELS.HIGH) {
    // Create a group to hold all stadium parts
    const stadium = new THREE.Group();
    
    // Make sure we have materials and geometries
    if (!stadiumMaterials || !stadiumGeometries) {
        console.error('Stadium materials or geometries not initialized');
        return stadium; // Return empty group to avoid crashes
    }
    
    // Choose geometry set based on detail level
    let geometries;
    switch(detailLevel) {
        case STADIUM_DETAIL_LEVELS.HIGH:
            geometries = stadiumGeometries.high;
            break;
        case STADIUM_DETAIL_LEVELS.MEDIUM:
            geometries = stadiumGeometries.medium;
            break;
        case STADIUM_DETAIL_LEVELS.LOW:
            geometries = stadiumGeometries.low;
            break;
        default:
            geometries = stadiumGeometries.high;
    }
    
    // Create the stadium base
    const base = new THREE.Mesh(geometries.base, stadiumMaterials.base);
    base.position.y = 10;
    base.castShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
    base.receiveShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
    stadium.add(base);
    
    // Create the stadium seating area
    const bowl = new THREE.Mesh(geometries.bowl, stadiumMaterials.bowl);
    bowl.position.y = 40;
    bowl.castShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
    bowl.receiveShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
    stadium.add(bowl);
    
    // Create the stadium inner field
    const field = new THREE.Mesh(geometries.field, stadiumMaterials.field);
    field.rotation.x = -Math.PI / 2;
    field.position.y = 21;
    field.receiveShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
    stadium.add(field);
    
    // Add stadium stands with crowd texture - with enhanced positioning
    if (geometries.stands) {
        try {
            // Create custom crowd material for this stadium to avoid shared mapping
            const crowdMaterial = stadiumMaterials.crowd.clone();
            
            // Add slight random variation to texture offset for each stadium
            // This prevents all stadiums from having identical crowd patterns
            if (crowdMaterial.map) {
                const randomU = Math.random() * 0.3;
                const randomV = Math.random() * 0.2;
                
                // Clone the texture to avoid affecting other stadiums
                crowdMaterial.map = crowdMaterial.map.clone();
                crowdMaterial.map.needsUpdate = true;
                
                // Set new offsets
                crowdMaterial.map.offset.set(randomU, randomV);
                
                // Improved texture repeating based on detail level and cylinder size
                // This creates more realistic crowd patterns around the stadium
                if (detailLevel === STADIUM_DETAIL_LEVELS.HIGH) {
                    // More horizontal repeats to wrap around the cylinder circumference
                    // Fewer vertical repeats to match the cylinder height
                    crowdMaterial.map.repeat.set(12, 2); // More detail for close stadiums
                } else if (detailLevel === STADIUM_DETAIL_LEVELS.MEDIUM) {
                    crowdMaterial.map.repeat.set(8, 1.5); // Medium detail
                } else {
                    crowdMaterial.map.repeat.set(6, 1); // Less detail for far stadiums
                }
            }
            
            // Create stands with crowd texture
            const stands = new THREE.Mesh(geometries.stands, crowdMaterial);
            
            // Position the stands to align with the bowl - adjusted for the inverted geometry
            stands.position.y = 35;
            
            // Since we're using an inverted cone (larger at top, smaller at bottom),
            // we need to flip the material to show the crowd on the inside
            crowdMaterial.side = THREE.BackSide;
            
            stands.castShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
            stands.receiveShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
            
            // Add a slight rotation to the stands for better texture alignment
            stands.rotation.y = Math.PI * 0.35;
            
            stadium.add(stands);
        } catch (e) {
            console.error('Error creating stadium stands:', e);
            
            // Fallback with basic material if texture fails
            const fallbackMaterial = new THREE.MeshStandardMaterial({
                color: 0xe74c3c,
                roughness: 0.9,
                metalness: 0.1,
                side: THREE.BackSide // Use BackSide for the inverted geometry
            });
            
            const stands = new THREE.Mesh(geometries.stands, fallbackMaterial);
            stands.position.y = 35;
            stadium.add(stands);
        }
    }
    
    // Create light poles - only for high detail
    if (detailLevel === STADIUM_DETAIL_LEVELS.HIGH && geometries.pole) {
        for (let i = 0; i < 2; i++) {
            const angle = (i * Math.PI);
            const x = Math.cos(angle) * 105;
            const z = Math.sin(angle) * 105;
            
            // Pole
            const pole = new THREE.Mesh(geometries.pole, stadiumMaterials.pole);
            pole.position.set(x, 60, z);
            pole.castShadow = true;
            stadium.add(pole);
            
            // Light fixture
            const fixture = new THREE.Mesh(geometries.fixture, stadiumMaterials.fixture);
            fixture.position.set(x, 100, z);
            fixture.castShadow = true;
            stadium.add(fixture);
        }
    }
    
    return stadium;
}

function createStadiums(numberOfPeople) {
    if (!templatesReady) {
        pendingPeopleCount = numberOfPeople;
        return;
    }
    
    // Clear existing instanced meshes
    stadiumInstances.forEach(mesh => scene.remove(mesh));
    stadiumInstances = [];
    stadiums = [];
    
    // Clear existing stadium labels
    const labelElements = document.getElementsByClassName('stadium-label');
    while (labelElements.length > 0) {
        labelElements[0].remove();
    }
    
    // Remove initial grid if it exists
    const initialGrid = scene.getObjectByName("initialGrid");
    if (initialGrid) {
        disposeSceneObject(initialGrid);
    }
    
    // Calculate how many stadiums we need
    const numberOfStadiums = Math.ceil(numberOfPeople / STADIUM_CAPACITY);
    const stadiumsToRender = Math.min(numberOfStadiums, MAX_RENDERED_STADIUMS);
    const renderLimitText = numberOfStadiums > stadiumsToRender
        ? ` (showing ${stadiumsToRender.toLocaleString()})`
        : '';

    document.getElementById('stadiums-count').textContent = `Stadiums: ${numberOfStadiums.toLocaleString()}${renderLimitText}`;
    document.getElementById('people-total').textContent = `People: ${numberOfPeople.toLocaleString()}`;
    
    const effectiveGridSize = Math.min(GRID_SIZE, Math.ceil(Math.sqrt(stadiumsToRender)));

    // LOD counts: first 50 = HIGH, next 150 = MEDIUM, rest = LOW
    const highCount   = Math.min(stadiumsToRender, 50);
    const mediumCount = Math.max(0, Math.min(stadiumsToRender - 50, 150));
    const lowCount    = Math.max(0, stadiumsToRender - 200);

    // Calculate the ground size based on number of stadiums
    const rows = Math.ceil(stadiumsToRender / effectiveGridSize);
    const groundWidth  = (effectiveGridSize + 1) * STADIUM_SPACING;
    const groundLength = (rows + 1) * STADIUM_SPACING;
    const groundSize   = Math.max(groundWidth, groundLength);
    
    // Remove old ground if it exists (find by name)
    const existingGround = scene.getObjectByName("ground");
    if (existingGround) {
        disposeSceneObject(existingGround);
    }
    
    // Create new ground plane that fits all stadiums
    const groundGeometry = new THREE.PlaneGeometry(groundWidth, groundLength);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4ca64c,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.receiveShadow = true;
    ground.name = "ground"; // Give it a name for easy finding
    scene.add(ground);
    
    // Update the grid helper to match ground size
    const existingGrid = scene.getObjectByName("mainGrid");
    if (existingGrid) {
        disposeSceneObject(existingGrid);
    }

    const gridHelper = new THREE.GridHelper(groundSize, Math.floor(groundSize / 400), 0x000000, 0x000000);
    gridHelper.position.y = 0.1;
    gridHelper.name = "mainGrid";
    gridHelper.material.opacity = 0.12;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Create a set of InstancedMeshes for one LOD level
    function createInstanceSet(geos, count, castsShadows) {
        if (count <= 0 || !geos) return null;

        const meshBase   = new THREE.InstancedMesh(geos.base,   stadiumMaterials.base,  count);
        const meshBowl   = new THREE.InstancedMesh(geos.bowl,   stadiumMaterials.bowl,  count);
        const meshField  = new THREE.InstancedMesh(geos.field,  stadiumMaterials.field, count);
        const meshStands = new THREE.InstancedMesh(geos.stands, stadiumMaterials.crowd, count);
        meshBase.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        meshBowl.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        meshField.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        meshStands.instanceMatrix.setUsage(THREE.StaticDrawUsage);

        meshBase.castShadow = meshBowl.castShadow = meshStands.castShadow = castsShadows;
        meshBase.receiveShadow = meshBowl.receiveShadow = meshField.receiveShadow = meshStands.receiveShadow = castsShadows;

        const set = [meshBase, meshBowl, meshField, meshStands];

        // Light poles only for HIGH detail
        if (geos.pole && geos.fixture) {
            const meshPole    = new THREE.InstancedMesh(geos.pole,    stadiumMaterials.pole,    count * 2);
            const meshFixture = new THREE.InstancedMesh(geos.fixture, stadiumMaterials.fixture, count * 2);
            meshPole.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            meshFixture.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            meshPole.castShadow = castsShadows;
            meshFixture.castShadow = castsShadows;
            set.push(meshPole, meshFixture);
        }

        set.forEach(m => { scene.add(m); stadiumInstances.push(m); });
        return set;
    }

    const highSet   = createInstanceSet(stadiumGeometries.high,   highCount, true);
    const mediumSet = createInstanceSet(stadiumGeometries.medium, mediumCount, false);
    const lowSet    = createInstanceSet(stadiumGeometries.low,    lowCount, false);

    // Reusable dummy Object3D for matrix calculation
    const dummy = new THREE.Object3D();

    // Hard cap of 30 labels regardless of stadium count, always include #1 and #last
    const MAX_LABELS = 30;
    const labelInterval = Math.ceil(stadiumsToRender / MAX_LABELS);
    const totalRows = Math.ceil(stadiumsToRender / effectiveGridSize);
    const labelFragment = document.createDocumentFragment();

    for (let i = 0; i < stadiumsToRender; i++) {
        const row = Math.floor(i / effectiveGridSize);
        const col = i % effectiveGridSize;
        const x = (col - Math.floor(effectiveGridSize / 2)) * STADIUM_SPACING;
        const z = (row - Math.floor(totalRows / 2)) * STADIUM_SPACING;

        let set, localIndex;
        if (i < highCount) {
            set = highSet;   localIndex = i;
        } else if (i < highCount + mediumCount) {
            set = mediumSet; localIndex = i - highCount;
        } else {
            set = lowSet;    localIndex = i - highCount - mediumCount;
        }

        if (!set) { stadiums.push(null); continue; }

        // Base (y = 10)
        dummy.position.set(x, 10, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        set[0].setMatrixAt(localIndex, dummy.matrix);

        // Bowl (y = 40)
        dummy.position.set(x, 40, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        set[1].setMatrixAt(localIndex, dummy.matrix);

        // Field (rotated flat, y = 21)
        dummy.position.set(x, 21, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        set[2].setMatrixAt(localIndex, dummy.matrix);

        // Stands (y = 35, slight Y rotation)
        dummy.position.set(x, 35, z);
        dummy.rotation.set(0, Math.PI * 0.35, 0);
        dummy.updateMatrix();
        set[3].setMatrixAt(localIndex, dummy.matrix);

        // White instance color so the canvas crowd texture renders with its true colours
        set[3].setColorAt(localIndex, WHITE_INSTANCE_COLOR);

        // Light poles — HIGH detail only (set indices 4 & 5)
        if (set.length > 4) {
            for (let p = 0; p < 2; p++) {
                const angle = p * Math.PI;
                const px = x + Math.cos(angle) * 105;
                const pz = z + Math.sin(angle) * 105;

                dummy.position.set(px, 60, pz);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();
                set[4].setMatrixAt(localIndex * 2 + p, dummy.matrix);

                dummy.position.set(px, 100, pz);
                dummy.updateMatrix();
                set[5].setMatrixAt(localIndex * 2 + p, dummy.matrix);
            }
        }

        // Track count for adjustCameraView
        stadiums.push(null);

        // Labels: evenly spaced up to MAX_LABELS, always include first and last
        if (i === 0 || i === stadiumsToRender - 1 || i % labelInterval === 0) {
            addStadiumLabel(i + 1, x, z, labelFragment);
        }
    }

    document.getElementById('visualization-container').appendChild(labelFragment);

    // Commit all instance data to GPU
    stadiumInstances.forEach(m => {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });

    adjustCameraView();
    renderer.shadowMap.needsUpdate = true;
}

// Add text labels above stadiums
function formatStadiumLabel(n) {
    if (n >= 1000000) return `#${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
    if (n >= 1000)    return `#${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
    return `#${n}`;
}

function addStadiumLabel(number, x, z, parent) {
    // Create a div element for the label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'stadium-label';
    labelDiv.textContent = formatStadiumLabel(number);
    labelDiv.style.position = 'absolute';
    labelDiv.style.color = 'white';
    labelDiv.style.padding = '4px 8px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    labelDiv.style.fontSize = '14px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.userSelect = 'none';
    
    // Add to DOM
    parent.appendChild(labelDiv);
    
    // Store the 3D position for updating in render loop
    labelDiv.dataset.x = x;
    labelDiv.dataset.z = z;
    labelDiv.dataset.y = 120; // Height above stadium
}

// Update label positions in 3D space - optimized version
function updateLabels() {
    // Throttle to every 3rd frame to reduce DOM overhead
    if (frameCount % 3 !== 0) return;
    const labels = document.getElementsByClassName('stadium-label');
    if (labels.length === 0) return;
    
    labelCameraPosition.copy(camera.position);
    
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        labelWorldPosition.set(
            parseFloat(label.dataset.x),
            parseFloat(label.dataset.y),
            parseFloat(label.dataset.z)
        );
        
        // Distance threshold scales with how far back the camera is
        const distanceThreshold = Math.max(5000, labelCameraPosition.length() * 0.9);
        if (labelWorldPosition.distanceTo(labelCameraPosition) > distanceThreshold) {
            label.style.display = 'none';
            continue;
        }
        
        // Project 3D position to 2D screen position
        labelWorldPosition.project(camera);
        
        // Convert to CSS coordinates
        const x = (labelWorldPosition.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-labelWorldPosition.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        
        // Set label position
        label.style.transform = `translate(-50%, -50%)`;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        
        // Hide labels that are behind the camera
        label.style.display = labelWorldPosition.z < 1 ? 'block' : 'none';
    }
}

// Track frame count for optimization
let frameCount = 0;
let lastTime = 0;
let fps = 0;

// Adjust camera to view all stadiums
function adjustCameraView() {
    if (stadiums.length === 0) return;
    
    // For very large numbers of stadiums, we need a farther camera view
    const numberOfStadiums = stadiums.length;
    const gridSize = Math.min(GRID_SIZE, Math.ceil(Math.sqrt(numberOfStadiums)));
    const rows = Math.ceil(numberOfStadiums / gridSize);
    
    // Get the actual ground size from the scene (use the larger dimension)
    const ground = scene.getObjectByName("ground");
    const groundSize = ground
        ? Math.max(ground.geometry.parameters.width, ground.geometry.parameters.height)
        : 5000;
    
    // Calculate appropriate camera distance based on ground size
    // Use a logarithmic scale for very large numbers to avoid extreme distances
    const baseDistance = Math.max(800, groundSize * 0.4);
    const scaleFactor = Math.log10(Math.max(1, rows / 2)) + 1;
    const distance = baseDistance * scaleFactor;
    
    // Limit maximum distance to avoid floating point precision issues
    const maxDistance = 15000;
    const finalDistance = Math.min(distance, maxDistance);
    
    // Set camera position - maintain height so camera doesn't go through ground
    const cameraHeight = Math.max(400, finalDistance * 0.4); // Ensure minimum height
    camera.position.set(finalDistance, cameraHeight, finalDistance);
    camera.lookAt(0, 0, 0);
    
    // Update controls
    controls.target.set(0, 0, 0);
    controls.maxDistance = Math.max(12000, finalDistance * 1.2);
    controls.update();
    
    // Adjust far plane for very large scenes
    camera.far = Math.max(15000, finalDistance * 3);
    camera.updateProjectionMatrix();
}

// Set up keyboard controls for flying with WASD
function setupKeyboardControls() {
    // Track key down events
    document.addEventListener('keydown', (event) => {
        // Check if user is typing in an input field (like the people-count field)
        const activeElement = document.activeElement;
        const isInputField = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.isContentEditable
        );
        
        // Only process movement keys if not typing in an input field
        if (!isInputField) {
            // Only process keys if the visualization container is focused
            const container = document.getElementById('visualization-container');
            if (!document.activeElement || !container.contains(document.activeElement)) {
                container.focus();
            }

            switch(event.key.toLowerCase()) {
                case 'w': keyState.w = true; break;
                case 'a': keyState.a = true; break;
                case 's': keyState.s = true; break;
                case 'd': keyState.d = true; break;
                case 'shift': keyState.shift = true; break;
            }
        }
    });

    // Track key up events - always process these to prevent keys getting "stuck"
    document.addEventListener('keyup', (event) => {
        switch(event.key.toLowerCase()) {
            case 'w': keyState.w = false; break;
            case 'a': keyState.a = false; break;
            case 's': keyState.s = false; break;
            case 'd': keyState.d = false; break;
            case 'shift': keyState.shift = false; break;
        }
    });

    // Make the visualization container focusable
    const container = document.getElementById('visualization-container');
    container.tabIndex = 0;  // Make the container focusable
    
    // Add instructions for keyboard controls
    const controlsHelp = document.querySelector('.controls-help p');
    if (controlsHelp) {
        controlsHelp.innerHTML = 'Mouse controls: Left-click + drag to rotate, Right-click + drag to pan, Scroll to zoom<br>Keyboard controls: WASD to fly, SHIFT to fly faster';
    }
}

// Process keyboard movement in the animation loop
function processKeyboardMovement(deltaSeconds) {
    if (!camera) return false; // Return false if no camera
    
    let moved = false; // Flag to track if movement occurred

    if (!(keyState.w || keyState.a || keyState.s || keyState.d)) {
        return false; // No movement keys pressed
    }

    // Apply sprint multiplier if shift is pressed
    const speed = (keyState.shift ? MOVEMENT_SPEED * SPRINT_MULTIPLIER : MOVEMENT_SPEED) * deltaSeconds * 60;
    
    // Get the camera's forward and right vectors
    camera.getWorldDirection(keyboardForward);
    // Calculate RIGHT = FORWARD x UP (instead of UP x FORWARD)
    keyboardRight.crossVectors(keyboardForward, camera.up).normalize(); 

    // Project forward vector onto the horizontal plane (XZ)
    keyboardForwardXZ.set(keyboardForward.x, 0, keyboardForward.z);
    
    // Only normalize and use if it's not a zero vector (i.e., not looking straight up/down)
    if (keyboardForwardXZ.lengthSq() > 0.0001) { // Use lengthSq for efficiency, check against small epsilon
        keyboardForwardXZ.normalize();
    } else {
        keyboardForwardXZ.set(0, 0, 0); // Ensure it's zero if looking vertically
    }
    
    // Calculate movement direction based on key states, using projected forward
    keyboardMoveDirection.set(0, 0, 0);
    
    if (keyState.w) keyboardMoveDirection.add(keyboardForwardXZ);
    if (keyState.s) keyboardMoveDirection.sub(keyboardForwardXZ);
    if (keyState.d) keyboardMoveDirection.add(keyboardRight);
    if (keyState.a) keyboardMoveDirection.sub(keyboardRight);
    
    // Normalize movement direction and apply speed
    if (keyboardMoveDirection.lengthSq() > 0) {
        keyboardMoveDirection.normalize().multiplyScalar(speed);
        
        // Update camera position
        camera.position.add(keyboardMoveDirection);
        controls.target.add(keyboardMoveDirection);
        moved = true; // Set flag to true as movement happened
        
        // Update controls - No need to update target for flying
        // controls.update(); // controls.update() is called in animate loop anyway
    }
    
    return moved; // Return whether movement occurred
}

// Animation loop - optimized
function animate(time) {
    requestAnimationFrame(animate);
    const deltaSeconds = lastFrameTime ? Math.min((time - lastFrameTime) / 1000, 0.05) : 1 / 60;
    lastFrameTime = time;
    
    // Calculate FPS for debugging
    if (time - lastTime > 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = time;
        // Uncomment to debug performance
        // console.log(`FPS: ${fps}`);
    }
    frameCount++;
    
    // Process keyboard input for flying
    const movedByKey = processKeyboardMovement(deltaSeconds);
    
    // Update controls only if WASD keys were not used in this frame
    if (!movedByKey) {
        controls.update();
    }
    
    // Enforce minimum camera height to prevent going below ground
    enforceCameraConstraints();
    
    // Update label positions
    updateLabels();
    
    // Render scene
    renderer.render(scene, camera);
}

// Prevent camera from going below ground
function enforceCameraConstraints() {
    // Ensure camera doesn't go below minimum height (slightly above ground)
    if (camera.position.y < 10) {
        camera.position.y = 10;
    }
    
    // Prevent camera from going too far under stadiums
    // Calculate the ground plane y at camera's xz position
    const groundY = 0; // In this case ground is at y=0
    
    // Enforce minimum height above ground
    const minHeightAboveGround = 10;
    if (camera.position.y < groundY + minHeightAboveGround) {
        camera.position.y = groundY + minHeightAboveGround;
    }
}

// Handle window resize - debounced for performance
let resizeTimeout;
function onWindowResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Update camera
        camera.aspect = document.getElementById('visualization-container').clientWidth / 
                        document.getElementById('visualization-container').clientHeight;
        camera.updateProjectionMatrix();
        
        // Update renderer
        renderer.setSize(
            document.getElementById('visualization-container').clientWidth,
            document.getElementById('visualization-container').clientHeight
        );
    }, 100);
}

// Add a function to reset view to a good starting point
function resetCameraView() {
    adjustCameraView();
}

// Add a "reset view" button to the UI
function addResetViewButton() {
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-view-btn';
    resetButton.textContent = 'Reset View';
    resetButton.classList.add('control-btn');
    
    // Add to DOM after the visualization container
    const container = document.getElementById('visualization-container');
    container.parentNode.insertBefore(resetButton, container.nextSibling);
    
    // Add event listener
    resetButton.addEventListener('click', resetCameraView);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize 3D scene
    initScene();
    
    // Start animation loop
    animate();
    
    // Add UI controls
    addResetViewButton();
    
     
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    
    // Handle visualization button click
    document.getElementById('visualize-btn').addEventListener('click', () => {
        const peopleCount = parseInt(document.getElementById('people-count').value);
        
        if (isNaN(peopleCount) || peopleCount <= 0) {
            alert('Please enter a valid number of people');
            return;
        }
        
        createStadiums(peopleCount);
    });
    
    // Handle preset buttons
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const value = parseInt(button.dataset.value);
            document.getElementById('people-count').value = value;
            createStadiums(value);
        });
    });
    
    pendingPeopleCount = parseInt(document.getElementById('people-count').value, 10);
}); 
