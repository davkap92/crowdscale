// Global variables
let scene, camera, renderer, controls;
let stadiums = [];
const STADIUM_CAPACITY = 100000; // Each stadium represents 100,000 people
const STADIUM_SPACING = 500; // Space between stadiums
const GRID_SIZE = 20; // Increased maximum stadiums per row for larger grids
const PEOPLE_PER_DOT = 5000; // Each dot represents 5000 people (increased for performance)
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
    renderer.shadowMap.type = THREE.BasicShadowMap; // Use basic shadow maps for performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio
    
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
    
    // Add lights - simplified lighting for performance
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Increased ambient light
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

    // Add fog for depth - adjust for better performance
    scene.fog = new THREE.FogExp2(0xf0f0f0, 0.00025);
    
    // Load crowd texture - a realistic crowd image
    loadCrowdTexture().then(() => {
        // Pre-create stadium geometries and materials for different detail levels
        createStadiumTemplates();
        
        // Initialize with default value after textures are loaded
        const defaultPeopleCount = parseInt(document.getElementById('people-count').value);
        createStadiums(defaultPeopleCount);
    });

    // Add keyboard controls for WASD flying
    setupKeyboardControls();
}

// Load the crowd texture from a URL
function loadCrowdTexture() {
    return new Promise((resolve) => {
        // Alternative crowd image options in case one fails
        const imageOptions = [
            'https://images.unsplash.com/photo-1558151748-f2621b5e52f0?q=80&w=1024&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1578269030234-f4e465f9fe6e?q=80&w=1024&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1474224017046-182ece80b263?q=80&w=1024&auto=format&fit=crop'
        ];
        
        // Try to load the primary image
        const textureLoader = new THREE.TextureLoader();
        
        // Add error handling for texture loading
        const loadTexture = (index) => {
            if (index >= imageOptions.length) {
                console.error('All crowd texture options failed to load');
                // Resolve anyway to allow the app to continue
                resolve();
                return;
            }
            
            const crowdTextureUrl = imageOptions[index];
            console.log(`Trying to load crowd texture: ${index + 1}/${imageOptions.length}`);
            
            textureLoader.load(
                // URL
                crowdTextureUrl,
                
                // Success callback
                (texture) => {
                    console.log('Crowd texture loaded successfully');
                    
                    // Apply advanced texture settings
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    
                    // Increase texture repetition for more crowd density
                    texture.repeat.set(8, 3);
                    
                    // Apply texture offset to avoid repetition patterns
                    texture.offset.set(0.25, 0.1);
                    
                    // Enable anisotropic filtering for sharper textures at angles
                    // Make sure renderer exists before accessing its capabilities
                    if (renderer && renderer.capabilities) {
                        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                    }
                    
                    // Enable mipmaps for better quality at different distances
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    
                    crowdTexture = texture;
                    resolve();
                },
                
                // Progress callback - optional
                undefined,
                
                // Error callback
                (error) => {
                    console.warn(`Failed to load crowd texture option ${index + 1}:`, error);
                    // Try the next option
                    loadTexture(index + 1);
                }
            );
        };
        
        // Start loading with the first option
        loadTexture(0);
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
            side: THREE.DoubleSide,
            // Enhanced material properties for crowd
            emissive: 0x111111,
            emissiveIntensity: 0.1, // Subtle glow to represent stadium lighting on people
            color: crowdTexture ? 0xeeeeee : 0xe74c3c, // Use fallback color if no texture
            bumpScale: 0.02 // Very subtle bump for crowd texture
        })
    };

    // Create high detail geometries
    stadiumGeometries.high = {
        base: new THREE.CylinderGeometry(100, 110, 20, 32),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 32, 5, true),
        field: new THREE.CircleGeometry(70, 32),
        stands: new THREE.CylinderGeometry(75, 102, 30, 32, 16, true), // Increased segments for better texture mapping
        pole: new THREE.CylinderGeometry(1, 1, 80, 6),
        fixture: new THREE.BoxGeometry(10, 5, 10)
    };
    
    // Create medium detail geometries
    stadiumGeometries.medium = {
        base: new THREE.CylinderGeometry(100, 110, 20, 16),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 16, 3, true),
        field: new THREE.CircleGeometry(70, 16),
        stands: new THREE.CylinderGeometry(75, 102, 30, 16, 8, true), // Increased segments for better texture mapping
        pole: new THREE.CylinderGeometry(1, 1, 80, 4),
        fixture: new THREE.BoxGeometry(10, 5, 10)
    };
    
    // Create low detail geometries
    stadiumGeometries.low = {
        base: new THREE.CylinderGeometry(100, 110, 20, 8),
        bowl: new THREE.CylinderGeometry(95, 105, 40, 8, 1, true),
        field: new THREE.CircleGeometry(70, 8),
        stands: new THREE.CylinderGeometry(75, 102, 30, 8, 4, true), // Increased segments for better texture mapping
        pole: null, // No poles for low detail
        fixture: null // No fixtures for low detail
    };
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
                const randomU = Math.random() * 0.5;
                const randomV = Math.random() * 0.5;
                
                // Clone the texture to avoid affecting other stadiums
                crowdMaterial.map = crowdMaterial.map.clone();
                crowdMaterial.map.needsUpdate = true;
                
                // Set new offsets
                crowdMaterial.map.offset.set(randomU, randomV);
                
                // Slightly adjust the repeat based on detail level
                if (detailLevel === STADIUM_DETAIL_LEVELS.HIGH) {
                    crowdMaterial.map.repeat.set(8, 3); // More detail for close stadiums
                } else if (detailLevel === STADIUM_DETAIL_LEVELS.MEDIUM) {
                    crowdMaterial.map.repeat.set(6, 2); // Medium detail
                } else {
                    crowdMaterial.map.repeat.set(4, 1); // Less detail for far stadiums
                }
            }
            
            // Create stands with crowd texture
            const stands = new THREE.Mesh(geometries.stands, crowdMaterial);
            stands.position.y = 30;
            stands.castShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
            stands.receiveShadow = detailLevel === STADIUM_DETAIL_LEVELS.HIGH;
            
            // Add a slight rotation to the stands for better texture alignment
            stands.rotation.y = Math.PI * 0.25;
            
            stadium.add(stands);
        } catch (e) {
            console.error('Error creating stadium stands:', e);
            
            // Fallback with basic material if texture fails
            const fallbackMaterial = new THREE.MeshStandardMaterial({
                color: 0xe74c3c,
                roughness: 0.9,
                metalness: 0.1,
                side: THREE.DoubleSide
            });
            
            const stands = new THREE.Mesh(geometries.stands, fallbackMaterial);
            stands.position.y = 30;
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

// Position stadiums in a grid layout
function createStadiums(numberOfPeople) {
    console.time('createStadiums');
    
    // Clear existing stadiums
    stadiums.forEach(stadium => {
        scene.remove(stadium);
    });
    stadiums = [];
    
    // Clear existing stadium labels
    const labelElements = document.getElementsByClassName('stadium-label');
    while (labelElements.length > 0) {
        labelElements[0].remove();
    }
    
    // Remove initial grid if it exists
    const initialGrid = scene.getObjectByName("initialGrid");
    if (initialGrid) {
        scene.remove(initialGrid);
    }
    
    // Calculate how many stadiums we need
    const numberOfStadiums = Math.ceil(numberOfPeople / STADIUM_CAPACITY);
    document.getElementById('stadiums-count').textContent = `Stadiums: ${numberOfStadiums}`;
    document.getElementById('people-total').textContent = `People: ${numberOfPeople.toLocaleString()}`;
    
    // No stadium limit now - render all stadiums
    const stadiumsToRender = numberOfStadiums;
    
    // Adjust grid size based on stadium count for better layout
    const effectiveGridSize = Math.min(GRID_SIZE, Math.ceil(Math.sqrt(stadiumsToRender)));
    
    // Create stadium models for different detail levels (reused for efficiency)
    const highDetailModel = createStadiumModel(STADIUM_DETAIL_LEVELS.HIGH);
    const mediumDetailModel = createStadiumModel(STADIUM_DETAIL_LEVELS.MEDIUM);
    const lowDetailModel = createStadiumModel(STADIUM_DETAIL_LEVELS.LOW);
    
    // Calculate the ground size based on number of stadiums
    const rows = Math.ceil(stadiumsToRender / effectiveGridSize);
    const groundSize = Math.max(
        10000, // Minimum base size
        (effectiveGridSize + 2) * STADIUM_SPACING, // Width with margin
        (rows + 2) * STADIUM_SPACING // Length with margin
    );
    
    // Remove old ground if it exists (find by name)
    const existingGround = scene.getObjectByName("ground");
    if (existingGround) {
        scene.remove(existingGround);
    }
    
    // Create new ground plane that fits all stadiums
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
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
        scene.remove(existingGrid);
    }
    
    const gridHelper = new THREE.GridHelper(groundSize, Math.floor(groundSize/400), 0x000000, 0x000000);
    gridHelper.position.y = 0.1; // Slightly above ground to prevent z-fighting
    gridHelper.name = "mainGrid";
    scene.add(gridHelper);
    
    // Use batch processing for better performance - process in smaller chunks
    const batchSize = 20; // Fixed batch size
    const totalBatches = Math.ceil(stadiumsToRender / batchSize);
    
    // Process first batch immediately
    processBatch(0);
    
    // Process remaining batches with delays to avoid blocking the UI
    for (let batchIndex = 1; batchIndex < totalBatches; batchIndex++) {
        setTimeout(() => {
            processBatch(batchIndex);
            
            // If this is the last batch, set up camera view
            if (batchIndex === totalBatches - 1) {
                adjustCameraView();
            }
        }, batchIndex * 10); // Fixed delay between batches
    }
    
    function processBatch(batchIndex) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, stadiumsToRender);
        
        for (let i = startIndex; i < endIndex; i++) {
            // Determine detail level based on position in the grid
            let detailLevel;
            if (i < 50) {
                detailLevel = STADIUM_DETAIL_LEVELS.HIGH;
            } else if (i < 200) {
                detailLevel = STADIUM_DETAIL_LEVELS.MEDIUM;
            } else {
                detailLevel = STADIUM_DETAIL_LEVELS.LOW;
            }
            
            // Use the appropriate model based on detail level
            let stadiumModel;
            switch (detailLevel) {
                case STADIUM_DETAIL_LEVELS.HIGH:
                    stadiumModel = highDetailModel.clone();
                    break;
                case STADIUM_DETAIL_LEVELS.MEDIUM:
                    stadiumModel = mediumDetailModel.clone();
                    break;
                default:
                    stadiumModel = lowDetailModel.clone();
            }
            
            // Calculate stadium capacity
            const stadiumCapacity = (i === numberOfStadiums - 1 && numberOfPeople % STADIUM_CAPACITY !== 0) 
                ? numberOfPeople % STADIUM_CAPACITY 
                : STADIUM_CAPACITY;
            
            // Calculate grid position using a square grid pattern
            const row = Math.floor(i / effectiveGridSize);
            const col = i % effectiveGridSize;
            
            // Calculate 3D position
            const x = (col - Math.floor(effectiveGridSize / 2)) * STADIUM_SPACING;
            const z = (row - Math.floor(stadiumsToRender / effectiveGridSize / 2)) * STADIUM_SPACING;
            
            stadiumModel.position.set(x, 0, z);
            stadiumModel.userData = { index: i + 1 }; // Store stadium number for raycasting
            
            // Add to scene and store reference
            scene.add(stadiumModel);
            stadiums.push(stadiumModel);
            
            // Add stadium number label (simplified)
            // Only add labels to a subset of stadiums based on how many we have
            const labelInterval = (numberOfStadiums <= 100 ? 1 : 
                             numberOfStadiums <= 300 ? 3 : 
                             numberOfStadiums <= 600 ? 10 : 20);
                                   
            if (i % labelInterval === 0 || i === 0 || i === stadiumsToRender - 1) {
                addStadiumLabel(i + 1, x, z);
            }
        }
    }
    
    // If there are very few stadiums, adjust camera view immediately
    if (stadiumsToRender <= batchSize) {
        adjustCameraView();
    }
    
    console.timeEnd('createStadiums');
}

// Add text labels above stadiums
function addStadiumLabel(number, x, z) {
    // Create a div element for the label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'stadium-label';
    labelDiv.textContent = `#${number}`; // Simplified label
    labelDiv.style.position = 'absolute';
    labelDiv.style.color = 'white';
    labelDiv.style.padding = '4px 8px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    labelDiv.style.fontSize = '14px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.userSelect = 'none';
    
    // Add to DOM
    document.getElementById('visualization-container').appendChild(labelDiv);
    
    // Store the 3D position for updating in render loop
    labelDiv.dataset.x = x;
    labelDiv.dataset.z = z;
    labelDiv.dataset.y = 120; // Height above stadium
}

// Update label positions in 3D space - optimized version
function updateLabels() {
    // Update labels every frame
    const labels = document.getElementsByClassName('stadium-label');
    if (labels.length === 0) return;
    
    const cameraPosition = camera.position.clone();
    
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const position = new THREE.Vector3(
            parseFloat(label.dataset.x),
            parseFloat(label.dataset.y),
            parseFloat(label.dataset.z)
        );
        
        // Skip updating labels that are far from camera for performance
        const distanceThreshold = 5000;
        if (position.distanceTo(cameraPosition) > distanceThreshold) {
            label.style.display = 'none';
            continue;
        }
        
        // Project 3D position to 2D screen position
        position.project(camera);
        
        // Convert to CSS coordinates
        const x = (position.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-position.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        
        // Set label position
        label.style.transform = `translate(-50%, -50%)`;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        
        // Hide labels that are behind the camera
        label.style.display = position.z < 1 ? 'block' : 'none';
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
    
    // Get the actual ground size from the scene
    const ground = scene.getObjectByName("ground");
    const groundSize = ground ? ground.geometry.parameters.width : 10000;
    
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
    controls.update();
    
    // Adjust far plane for very large scenes
    camera.far = Math.max(15000, finalDistance * 3);
    camera.updateProjectionMatrix();
}

// Set up keyboard controls for flying with WASD
function setupKeyboardControls() {
    // Track key down events
    document.addEventListener('keydown', (event) => {
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
    });

    // Track key up events
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
    
}

// Process keyboard movement in the animation loop
function processKeyboardMovement() {
    if (!camera || !(keyState.w || keyState.a || keyState.s || keyState.d)) return;
    
    // Apply sprint multiplier if shift is pressed
    const speed = keyState.shift ? MOVEMENT_SPEED * SPRINT_MULTIPLIER : MOVEMENT_SPEED;
    
    // Get the camera's forward, right, and up vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    
    // Calculate movement direction based on key states
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    if (keyState.w) moveDirection.add(forward);
    if (keyState.s) moveDirection.sub(forward);
    if (keyState.d) moveDirection.add(right);
    if (keyState.a) moveDirection.sub(right);
    
    // Normalize movement direction and apply speed
    if (moveDirection.length() > 0) {
        moveDirection.normalize().multiplyScalar(speed);
        
        // Update camera position
        camera.position.add(moveDirection);
        
        // Update controls target to maintain the same viewing direction
        controls.target.add(moveDirection);
        
        // Update controls
        controls.update();
    }
}

// Animation loop - optimized
function animate(time) {
    requestAnimationFrame(animate);
    
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
    processKeyboardMovement();
    
    // Update controls
    controls.update();
    
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
    camera.position.set(600, 400, 600);
    camera.lookAt(0, 0, 0);
    controls.update();
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
    
    // Initialize with default value
    const defaultPeopleCount = parseInt(document.getElementById('people-count').value);
    createStadiums(defaultPeopleCount);
}); 