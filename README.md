# Babylon.js + 3Dconnexion SpaceMouse fly navigation

This repository contains a minimal Babylon.js example and a reusable JavaScript controller for using a 3Dconnexion SpaceMouse / SpaceNavigator-style 6-DOF device as a fly-navigation camera controller. This project is inpired by an analogous implementation for Three.js (https://3dconnexion.com/technical_support/web_threejs.html).

The HTML example only creates a Babylon scene, creates a camera, and attaches the controller. The integration logic is in:

```text
js/babylon-3dconnexion-fly-controller.js
```

## Repository structure

```text
.
├── index.html
├── js/
│   └── babylon-3dconnexion-fly-controller.js
├── vendor/
│   └── README.md
├── README.md
├── NOTICE.md
├── LICENSE
├── package.json
└── .gitignore
```

`3dconnexion.min.js` is not included. Place your local copy here:

```text
vendor/3dconnexion.min.js
```

## Running locally

Use a local HTTP server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Avoid `file://` loading. Device integrations and browser security behavior are more predictable over local HTTP.

## Minimal integration pattern

Load Babylon, the 3Dconnexion JavaScript file, and the controller:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="./vendor/3dconnexion.min.js"></script>
<script src="./js/babylon-3dconnexion-fly-controller.js"></script>
```

Create a right-handed Babylon scene:

```js
const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem = true;
```

Create a camera with a quaternion rotation:

```js
const camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 2, -10), scene);
camera.rotationQuaternion = BABYLON.Quaternion.Identity();
```

Attach the controller:

```js
const controller = new Babylon3DconnexionFlyController({
  canvas,
  camera,
  scene,
  maxTranslationStep: 0.08,
});

controller.connect();
```

Optional helpers:

```js
controller.reset();
controller.downloadLog();
```

## Design choices

### Right-handed scene

The controller assumes:

```js
scene.useRightHandedSystem = true;
```

This matches the coordinate convention used by the 3Dconnexion web/Three.js sample more closely than Babylon's default left-handed mode. It avoids the Z-reflection bridge that caused cross-axis coupling during earlier tests.

### `setViewMatrix()` is treated as input, not as an absolute camera pose

The 3Dconnexion API provides `setViewMatrix()` callbacks. Applying that matrix directly to the Babylon camera can make translation remain attached to the initial navigation frame after the camera has rotated.

The controller instead uses consecutive `setViewMatrix()` values as an incremental input stream:

```text
previous SDK view matrix
current SDK view matrix
→ raw SDK translation delta
→ local right/up/forward command
→ replay on the current Babylon camera axes
```

This makes forward/back follow the current camera direction after yaw, pitch, and roll.

### `setTarget()` is diagnostic-only

The controller logs `setTarget()` but does not use it for movement. In testing, the target stream behaved like an absolute navigation value and produced coupled X/Z translation after rotations.

### Rotation is incremental

The controller computes a local rotation delta between consecutive SDK matrices and multiplies it into the current Babylon camera quaternion:

```js
const newRotation = camera.rotationQuaternion.multiply(deltaRotation);
```

The camera matrix is kept free of scale/shear by decomposing the SDK world matrices and using only position plus normalized rotation.

### Translation is clamped

`maxTranslationStep` limits unusually large per-frame translation jumps:

```js
new Babylon3DconnexionFlyController({
  canvas,
  camera,
  maxTranslationStep: 0.08,
});
```

Lower it if motion is too fast. Increase it if motion is too slow and remains stable.

## Logging

The controller keeps an in-memory log. The example page includes a **Download log** button that saves a JSON file with:

```text
browser user agent
Babylon version
callback counters
camera state
recent SDK/camera events
```

You can also read `controller.log` directly from your application.

## 3Dconnexion JavaScript file and licensing

This repository intentionally does not redistribute `3dconnexion.min.js`.
