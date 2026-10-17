const init = () => {
  const canvas = document.getElementById('renderCanvas');
  const consoleOutput = document.getElementById('consoleOutput');
  const hierarchy = document.querySelector('.hierarchy-tree');
  const inspectorName = document.querySelector('.object-header span');
  const sections = {
    light: document.querySelector('[data-section="light"]'),
    meshFilter: document.querySelector('[data-section="mesh-filter"]'),
    meshRenderer: document.querySelector('[data-section="mesh-renderer"]'),
    rotation: document.querySelector('[data-transform-rotation]'),
  };
  const lightInputs = Object.fromEntries(
    [...document.querySelectorAll('[data-light-property]')].map((input) => [input.dataset.lightProperty, input])
  );
  const skyInputs = Object.fromEntries(
    [...document.querySelectorAll('[data-sky-property]')].map((input) => [input.dataset.skyProperty, input])
  );
  const skyOutputs = Object.fromEntries(
    [...document.querySelectorAll('[data-sky-value]')].map((output) => [output.dataset.skyValue, output])
  );
  const skyStatus = document.querySelector('[data-sky-status]');
  const playButton = document.querySelector('.play-btn');
  const stopButton = document.querySelector('.stop-btn');
  const propertyInputs = Object.fromEntries(
    [...document.querySelectorAll('[data-property]')].map((input) => [input.dataset.property, input])
  );

  if (!canvas || !consoleOutput || !hierarchy || !playButton || !stopButton) {
    throw new Error('STAM Engine UI is missing required elements.');
  }
  if (!skyInputs.model || !skyStatus) {
    throw new Error('Sky model controls are missing from the Inspector.');
  }

  const appendConsole = (message) => {
    const line = document.createElement('div');
    line.textContent = `> ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  appendConsole('Stam Engine v0.1.0');

  const engine = new BABYLON.Engine(canvas, true, { stencil: true });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

  const camera = new BABYLON.FreeCamera('Main Camera', new BABYLON.Vector3(0, 2.5, -8), scene);
  camera.rotation.set(0.18, 0, 0);
  camera.minZ = 0.1;
  scene.activeCamera = camera;

  const light = new BABYLON.DirectionalLight(
    'Directional Light',
    new BABYLON.Vector3(-1, -2, 1),
    scene
  );
  light.position.set(8, 12, -6);
  light.intensity = 1.2;

  const skybox = BABYLON.MeshBuilder.CreateBox('Atmospheric Sky', { size: 1200 }, scene);
  skybox.isPickable = false;
  const skyMaterial = new BABYLON.SkyMaterial('Atmospheric Sky Material', scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.useSunPosition = true;
  skyMaterial.sunPosition = light.direction.scale(-1000);
  skyMaterial.turbidity = 8;
  skyMaterial.rayleigh = 2;
  skyMaterial.luminance = 1;
  skyMaterial.mieCoefficient = 0.005;
  skyMaterial.mieDirectionalG = 0.8;
  skyMaterial.disableSunDisk = false;
  skybox.material = skyMaterial;
  skybox.infiniteDistance = true;

  const hdrSkyboxMaterial = new BABYLON.StandardMaterial('HDRI Sky Material', scene);
  hdrSkyboxMaterial.backFaceCulling = false;
  hdrSkyboxMaterial.reflectionTexture = null;
  hdrSkyboxMaterial.diffuseColor = BABYLON.Color3.Black();
  hdrSkyboxMaterial.specularColor = BABYLON.Color3.Black();
  hdrSkyboxMaterial.disableLighting = true;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.exposure = 0.8;
  let hdrSkyTexture = null;
  let hdrSkyReady = false;

  const cloudAnchor = new BABYLON.TransformNode('Cloud Field', scene);
  const cloudMaterial = new BABYLON.StandardMaterial('Cloud Layer Material', scene);
  cloudMaterial.diffuseColor = new BABYLON.Color3(0.94, 0.97, 1);
  cloudMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.53, 0.58);
  cloudMaterial.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  cloudMaterial.backFaceCulling = false;
  cloudMaterial.alpha = 0.88;
  cloudMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  cloudMaterial.disableDepthWrite = true;
  const cloudMeshes = [];
  const cloudClusterCount = 48;
  let cloudFieldCreated = false;
  let cloudSeed = 421337;
  const randomCloudValue = () => {
    cloudSeed = (1664525 * cloudSeed + 1013904223) >>> 0;
    return cloudSeed / 4294967296;
  };
  const createCloudField = () => {
    if (cloudFieldCreated) return;
    cloudFieldCreated = true;
    for (let i = 0; i < cloudClusterCount; i += 1) {
      const azimuth = i * 2.399963229728653;
      const elevation = 0.04 + randomCloudValue() * 0.44;
      const radius = 430;
      const horizontalRadius = Math.cos(elevation) * radius;
      const center = new BABYLON.Vector3(
        Math.sin(azimuth) * horizontalRadius,
        Math.sin(elevation) * radius,
        Math.cos(azimuth) * horizontalRadius
      );
      const puffs = [];
      const puffCount = 4 + Math.floor(randomCloudValue() * 4);
      for (let j = 0; j < puffCount; j += 1) {
        const puff = BABYLON.MeshBuilder.CreateSphere(
          `Cloud Puff ${i}-${j}`,
          { diameter: 1, segments: 10 },
          scene
        );
        puff.position.set(
          (randomCloudValue() - 0.5) * 48,
          (randomCloudValue() - 0.5) * 14,
          (randomCloudValue() - 0.5) * 36
        );
        const width = 24 + randomCloudValue() * 22;
        puff.scaling.set(width, 14 + randomCloudValue() * 14, 20 + randomCloudValue() * 20);
        puff.material = cloudMaterial;
        puff.isPickable = false;
        puff.renderingGroupId = 1;
        puffs.push(puff);
      }
      const cloud = BABYLON.Mesh.MergeMeshes(puffs, true, true, undefined, false, false);
      if (!cloud) {
        throw new Error(`Could not create procedural cloud cluster ${i}.`);
      }
      cloud.name = `Cloud Cluster ${i + 1}`;
      cloud.position.copyFrom(center);
      cloud.parent = cloudAnchor;
      cloud.isPickable = false;
      cloud.renderingGroupId = 1;
      cloudMeshes.push(cloud);
    }
  };

  const syncSkyWithLight = () => {
    const sunDirection = light.direction.clone().normalize();
    skyMaterial.sunPosition = sunDirection.scale(-1000);
    const elevation = BABYLON.Tools.ToDegrees(Math.asin(
      Math.max(-1, Math.min(1, -sunDirection.y))
    ));
    skyInputs.sunElevation.value = String(Math.round(elevation));
    skyOutputs.sunElevation.value = `${Math.round(elevation)}°`;
  };
  const updateSkySettings = () => {
    const coverage = Number(skyInputs.clouds.value) / 100;
    const proceduralSelected = skyInputs.model.value === 'procedural';
    const useHdrSky = skyInputs.model.value === 'hdri' && hdrSkyReady;
    skyMaterial.turbidity = Number(skyInputs.turbidity.value);
    skyMaterial.rayleigh = Number(skyInputs.rayleigh.value);
    if (proceduralSelected) createCloudField();
    skybox.material = useHdrSky ? hdrSkyboxMaterial : skyMaterial;
    skybox.setEnabled(skyInputs.enabled.checked);
    const visibleCloudCount = Math.round(cloudClusterCount * coverage);
    cloudMeshes.forEach((cloud, index) => {
      cloud.setEnabled(
        skyInputs.enabled.checked &&
        proceduralSelected &&
        index < visibleCloudCount
      );
    });
    const proceduralControlsEnabled = !useHdrSky;
    skyInputs.clouds.disabled = !proceduralControlsEnabled;
    skyInputs.turbidity.disabled = !proceduralControlsEnabled;
    skyInputs.rayleigh.disabled = !proceduralControlsEnabled;
    skyInputs.sunElevation.disabled = useHdrSky;
    skyStatus.textContent = useHdrSky
      ? 'HDRI loaded. Natural clouds and sunlight are part of the panorama.'
      : skyInputs.model.value === 'hdri'
        ? 'Loading HDRI; procedural sky is shown until it is ready.'
        : 'Procedural mode: cloud and atmosphere controls are active.';
    skyOutputs.clouds.value = `${Math.round(coverage * 100)}%`;
    skyOutputs.turbidity.value = Number(skyInputs.turbidity.value).toFixed(1);
    skyOutputs.rayleigh.value = Number(skyInputs.rayleigh.value).toFixed(2);
  };
  skyInputs.model.addEventListener('change', updateSkySettings);
  skyInputs.clouds.addEventListener('input', updateSkySettings);
  skyInputs.turbidity.addEventListener('input', updateSkySettings);
  skyInputs.rayleigh.addEventListener('input', updateSkySettings);
  skyInputs.enabled.addEventListener('change', updateSkySettings);
  skyInputs.sunElevation.addEventListener('input', () => {
    const elevation = BABYLON.Tools.ToRadians(Number(skyInputs.sunElevation.value));
    const horizontalDirection = new BABYLON.Vector3(light.direction.x, 0, light.direction.z);
    if (horizontalDirection.lengthSquared() === 0) {
      horizontalDirection.set(-Math.SQRT1_2, 0, Math.SQRT1_2);
    } else {
      horizontalDirection.normalize();
    }
    light.direction = new BABYLON.Vector3(
      horizontalDirection.x * Math.cos(elevation),
      -Math.sin(elevation),
      horizontalDirection.z * Math.cos(elevation)
    ).normalize();
    syncSkyWithLight();
  });
  syncSkyWithLight();
  updateSkySettings();
  hdrSkyTexture = new BABYLON.HDRCubeTexture(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_puresky_1k.hdr',
    scene,
    512,
    false,
    true,
    false,
    false,
    () => {
      hdrSkyReady = true;
      hdrSkyTexture.level = 0.45;
      hdrSkyboxMaterial.reflectionTexture = hdrSkyTexture;
      hdrSkyTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
      updateSkySettings();
    },
    (message) => {
      skyInputs.model.value = 'procedural';
      updateSkySettings();
      skyStatus.textContent = 'HDRI could not be loaded; using procedural atmosphere.';
      appendConsole(`Could not load Poly Haven HDRI: ${message}`);
    }
  );

  const shadows = new BABYLON.ShadowGenerator(1024, light);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;

  const ground = BABYLON.MeshBuilder.CreateGround('Ground', { width: 200, height: 200 }, scene);
  ground.isPickable = true;
  ground.receiveShadows = true;
  ground.position.y = -0.01;
  const gridMaterial = new BABYLON.GridMaterial('Grid', scene);
  gridMaterial.mainColor = new BABYLON.Color3(0.08, 0.08, 0.08);
  gridMaterial.lineColor = new BABYLON.Color3(0.35, 0.35, 0.35);
  gridMaterial.gridRatio = 1;
  gridMaterial.opacity = 0.82;
  gridMaterial.majorUnitFrequency = 5;
  gridMaterial.minorUnitVisibility = 0.45;
  ground.material = gridMaterial;

  const defaultMaterial = new BABYLON.StandardMaterial('Default Material', scene);
  defaultMaterial.diffuseColor = new BABYLON.Color3(0.92, 0.92, 0.92);
  defaultMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

  const checkerTexture = new BABYLON.DynamicTexture(
    'Default Texture',
    { width: 128, height: 128 },
    scene,
    false
  );
  const textureContext = checkerTexture.getContext();
  const tileSize = 32;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      textureContext.fillStyle = (x + y) % 2 === 0 ? '#e8e8e8' : '#555555';
      textureContext.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  checkerTexture.update();
  const texturedMaterial = new BABYLON.StandardMaterial('Checker Material', scene);
  texturedMaterial.diffuseTexture = checkerTexture;

  const createCube = (name, position) => {
    const mesh = BABYLON.MeshBuilder.CreateBox(name, { size: 2 }, scene);
    mesh.position.copyFrom(position);
    mesh.material = defaultMaterial;
    mesh.isPickable = true;
    shadows.addShadowCaster(mesh);
    return mesh;
  };

  const firstCube = createCube('Cube', new BABYLON.Vector3(0, 1, 0));
  const meshRows = new Map();
  let selected = { type: 'mesh', object: firstCube, name: firstCube.name };
  let isPlaying = false;
  const pressedKeys = new Set();

  const setSelectedRow = (name) => {
    hierarchy.querySelectorAll('.tree-row.selected').forEach((row) => row.classList.remove('selected'));
    const row = hierarchy.querySelector(`[data-node="${CSS.escape(name)}"]`);
    if (row) row.classList.add('selected');
  };

  const updateInspector = () => {
    const { type, object, name } = selected;
    inspectorName.textContent = name;
    const isMesh = type === 'mesh';
    const isLight = type === 'light';
    sections.light.hidden = !isLight;
    sections.meshFilter.hidden = !isMesh;
    sections.meshRenderer.hidden = !isMesh;
    sections.rotation.hidden = isLight;

    const position = object.position;
    const rotation = type === 'light' ? BABYLON.Vector3.Zero() : object.rotation;
    const scaling = isMesh ? object.scaling : BABYLON.Vector3.One();
    const values = {
      positionX: position.x,
      positionY: position.y,
      positionZ: position.z,
      rotationX: BABYLON.Tools.ToDegrees(rotation.x),
      rotationY: BABYLON.Tools.ToDegrees(rotation.y),
      rotationZ: BABYLON.Tools.ToDegrees(rotation.z),
      scaleX: scaling.x,
      scaleY: scaling.y,
      scaleZ: scaling.z,
    };

    Object.entries(values).forEach(([key, value]) => {
      const input = propertyInputs[key];
      input.value = value.toFixed(3);
      input.disabled = (key.startsWith('scale') && !isMesh) ||
        (key.startsWith('rotation') && isLight);
    });
    if (isLight) {
      lightInputs.intensity.value = light.intensity.toFixed(2);
      lightInputs.color.value = light.diffuse.toHexString();
      lightInputs.directionX.value = light.direction.x.toFixed(3);
      lightInputs.directionY.value = light.direction.y.toFixed(3);
      lightInputs.directionZ.value = light.direction.z.toFixed(3);
      lightInputs.enabled.checked = light.isEnabled();
      lightInputs.shadows.checked = light.shadowEnabled;
    }
  };

  const select = (type, object, name) => {
    selected = { type, object, name };
    setSelectedRow(name);
    updateInspector();
  };

  const registerMesh = (mesh) => {
    let row = hierarchy.querySelector(`[data-node="${CSS.escape(mesh.name)}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'tree-row child-row';
      row.dataset.node = mesh.name;
      row.textContent = mesh.name;
      hierarchy.querySelector('.tree-group').appendChild(row);
    }
    meshRows.set(mesh.name, row);
    return row;
  };

  registerMesh(firstCube);
  hierarchy.querySelector('[data-node="Main Camera"]').addEventListener('click', () => {
    select('camera', camera, camera.name);
  });
  hierarchy.querySelector('[data-node="Directional Light"]').addEventListener('click', () => {
    select('light', light, light.name);
  });
  hierarchy.addEventListener('click', (event) => {
    const row = event.target.closest('[data-node]');
    if (!row || row.dataset.node === camera.name || row.dataset.node === light.name) return;
    const mesh = scene.getMeshByName(row.dataset.node);
    if (mesh && mesh !== ground) select('mesh', mesh, mesh.name);
  });

  const updateSelectedFromInspector = () => {
    const { type, object } = selected;
    const number = (key) => {
      const value = Number(propertyInputs[key].value);
      return Number.isFinite(value) ? value : 0;
    };
    object.position.set(number('positionX'), number('positionY'), number('positionZ'));
    if (type !== 'light') {
      object.rotation.set(
        BABYLON.Tools.ToRadians(number('rotationX')),
        BABYLON.Tools.ToRadians(number('rotationY')),
        BABYLON.Tools.ToRadians(number('rotationZ'))
      );
    }
    if (type === 'mesh') {
      object.scaling.set(number('scaleX'), number('scaleY'), number('scaleZ'));
    }
  };

  const updateLightFromInspector = () => {
    const value = (key) => Number(lightInputs[key].value);
    if (lightInputs.intensity.value !== '') {
      light.intensity = Math.max(0, Math.min(5, value('intensity')));
      lightInputs.intensity.value = light.intensity.toFixed(2);
      document.getElementById('light-intensity').value = String(light.intensity);
    }
    const direction = new BABYLON.Vector3(value('directionX'), value('directionY'), value('directionZ'));
    if (direction.lengthSquared() > 0) {
      light.direction = direction.normalize();
    }
    light.diffuse = BABYLON.Color3.FromHexString(lightInputs.color.value);
    light.setEnabled(lightInputs.enabled.checked);
    light.shadowEnabled = lightInputs.shadows.checked;
    syncSkyWithLight();
  };

  Object.values(lightInputs).forEach((input) => {
    input.addEventListener('input', updateLightFromInspector);
    input.addEventListener('change', updateLightFromInspector);
  });
  document.getElementById('light-intensity').addEventListener('input', (event) => {
    lightInputs.intensity.value = event.target.value;
    updateLightFromInspector();
  });

  Object.values(propertyInputs).forEach((input) => {
    input.addEventListener('input', updateSelectedFromInspector);
    input.addEventListener('change', updateSelectedFromInspector);
  });

  const heldMouse = { left: false, right: false, lastX: 0, lastY: 0 };
  const drag = { active: false, offsetX: 0, offsetZ: 0 };
  const canvasRect = () => canvas.getBoundingClientRect();
  const pick = (event, predicate) => {
    const rect = canvasRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return scene.pick(x, y, predicate, false, camera);
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      heldMouse.right = true;
      heldMouse.lastX = event.clientX;
      heldMouse.lastY = event.clientY;
      canvas.focus();
      if (document.pointerLockElement !== canvas) {
        try {
          const lockRequest = canvas.requestPointerLock();
          if (lockRequest && typeof lockRequest.catch === 'function') {
            lockRequest.catch((error) => appendConsole(`Mouse capture failed: ${error.message}`));
          }
        } catch (error) {
          appendConsole(`Mouse capture failed: ${error.message}`);
        }
      }
      return;
    }
    if (event.button !== 0) return;

    heldMouse.left = true;
    const result = pick(event, (mesh) => mesh !== ground);
    if (!result || !result.hit || !result.pickedMesh || result.pickedMesh === ground) {
      drag.active = false;
      return;
    }

    const mesh = result.pickedMesh;
    select('mesh', mesh, mesh.name);
    const groundHit = pick(event, (candidate) => candidate === ground);
    drag.active = true;
    if (groundHit && groundHit.hit && groundHit.pickedPoint) {
      drag.offsetX = mesh.position.x - groundHit.pickedPoint.x;
      drag.offsetZ = mesh.position.z - groundHit.pickedPoint.z;
    } else {
      drag.offsetX = 0;
      drag.offsetZ = 0;
    }
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (document.pointerLockElement === canvas) {
      camera.rotation.y += event.movementX * 0.002;
      camera.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, camera.rotation.x + event.movementY * 0.002)
      );
      return;
    }
    if (heldMouse.right) {
      const deltaX = event.clientX - heldMouse.lastX;
      const deltaY = event.clientY - heldMouse.lastY;
      heldMouse.lastX = event.clientX;
      heldMouse.lastY = event.clientY;
      camera.rotation.y += deltaX * 0.002;
      camera.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, camera.rotation.x + deltaY * 0.002)
      );
      return;
    }
    if (!heldMouse.left || !drag.active || selected.type !== 'mesh') return;

    const groundHit = pick(event, (candidate) => candidate === ground);
    if (groundHit && groundHit.hit && groundHit.pickedPoint) {
      selected.object.position.x = groundHit.pickedPoint.x + drag.offsetX;
      selected.object.position.z = groundHit.pickedPoint.z + drag.offsetZ;
      updateInspector();
    }
  });

  const releasePointer = (event) => {
    if (event.button === 0) {
      heldMouse.left = false;
      drag.active = false;
    }
    if (event.button === 2) {
      heldMouse.right = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  document.addEventListener('pointerup', releasePointer);
  document.addEventListener('pointerlockchange', () => {
    canvas.classList.toggle('mouse-locked', document.pointerLockElement === canvas);
    if (document.pointerLockElement !== canvas) heldMouse.right = false;
  });

  document.addEventListener('keydown', (event) => {
    if (document.pointerLockElement !== canvas && !heldMouse.right) return;
    pressedKeys.add(event.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) event.preventDefault();
  });
  document.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
  window.addEventListener('blur', () => pressedKeys.clear());

  const addCube = () => {
    const count = [...meshRows.keys()].filter((name) => name.startsWith('Cube')).length;
    const name = count === 1 ? 'Cube 2' : `Cube ${count + 1}`;
    const mesh = createCube(name, new BABYLON.Vector3(count * 2, 1, 0));
    registerMesh(mesh);
    select('mesh', mesh, name);
    appendConsole(`Created ${name}`);
  };

  const resetScene = () => {
    for (const [name] of meshRows) {
      if (name !== firstCube.name) {
        scene.getMeshByName(name)?.dispose();
        meshRows.get(name)?.remove();
        meshRows.delete(name);
      }
    }
    firstCube.position.set(0, 1, 0);
    firstCube.rotation.set(0, 0, 0);
    firstCube.scaling.set(1, 1, 1);
    firstCube.material = defaultMaterial;
    camera.position.set(0, 2.5, -8);
    camera.rotation.set(0.18, 0, 0);
    select('mesh', firstCube, firstCube.name);
    appendConsole('Loaded scene: SampleScene');
  };

  document.querySelectorAll('.asset-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.asset-item').forEach((asset) => asset.classList.remove('active'));
      item.classList.add('active');
      const category = item.querySelector('span')?.textContent.trim();
      if (category === 'Scenes') resetScene();
      if (category === 'Meshes') addCube();
      if (category === 'Materials' && selected.type === 'mesh') {
        selected.object.material = defaultMaterial;
        appendConsole(`Applied Default Material to ${selected.name}`);
      }
      if (category === 'Textures' && selected.type === 'mesh') {
        selected.object.material = texturedMaterial;
        appendConsole(`Applied Default Texture to ${selected.name}`);
      }
    });
  });

  playButton.addEventListener('click', () => {
    isPlaying = true;
    playButton.classList.add('is-active');
    playButton.setAttribute('aria-pressed', 'true');
    appendConsole('Play mode started');
  });
  stopButton.addEventListener('click', () => {
    isPlaying = false;
    playButton.classList.remove('is-active');
    playButton.setAttribute('aria-pressed', 'false');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    appendConsole('Play mode stopped');
  });

  const moveSpeed = 5;
  engine.runRenderLoop(() => {
    const delta = Math.min(engine.getDeltaTime() / 1000, 0.05) * moveSpeed;
    const forward = new BABYLON.Vector3(Math.sin(camera.rotation.y), 0, Math.cos(camera.rotation.y));
    const right = new BABYLON.Vector3(forward.z, 0, -forward.x);
    if (pressedKeys.has('KeyW')) camera.position.addInPlace(forward.scale(delta));
    if (pressedKeys.has('KeyS')) camera.position.subtractInPlace(forward.scale(delta));
    if (pressedKeys.has('KeyD')) camera.position.addInPlace(right.scale(delta));
    if (pressedKeys.has('KeyA')) camera.position.subtractInPlace(right.scale(delta));
    if (pressedKeys.has('KeyE')) camera.position.y += delta;
    if (pressedKeys.has('KeyQ')) camera.position.y -= delta;
    skybox.position.copyFrom(camera.position);
    cloudAnchor.position.copyFrom(camera.position);
    cloudAnchor.rotation.y += delta * 0.0015;
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
  select('mesh', firstCube, firstCube.name);
  appendConsole('Scene ready. Left-click/drag to select and move; right-click to fly (WASD, Q/E).');
  window.stamEngine = {
    engine,
    scene,
    camera,
    light,
    skybox,
    skyMaterial,
    cloudAnchor,
    cloudMeshes,
    ground,
    firstCube,
    addCube,
    resetScene,
  };
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
