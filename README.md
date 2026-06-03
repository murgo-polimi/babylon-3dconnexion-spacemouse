# Babylon.js + 3Dconnexion SpaceMouse

This is a minimal Babylon.js example for flying through a 3D scene in Babylon.js using a 3Dconnexion SpaceMouse / SpaceNavigator device through the 3Dconnexion web JavaScript API.

The example provided contains one HTML file, fixed working settings, a live diagnostic log, and a JSON log download button.

This implementation is based on an existing JavaScript API provided by 3dconnexion (`3dconnexion.min.js`) attached to a similar impementation for Three.js (https://3dconnexion.com/technical_support/web_threejs.html)


NB. The 3dconnexion API `3dconnexion.min.js` is not included in this repository. Download it and place it at:

```text
vendor/3dconnexion.min.js
```

## Repository contents

```text
.
├── index.html          # Minimal Babylon.js demo
├── README.md           # Usage and implementation notes
├── NOTICE.md           # Third-party file notes
├── LICENSE             # License for this repository's code
├── .gitignore
└── vendor/
    └── README.md       # Where to place 3dconnexion.min.js
```

`3dconnexion.min.js` is not included. Place it at:

```text
vendor/3dconnexion.min.js
```

## Run locally

Use a local HTTP server from the repository root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Do not rely on double-clicking `index.html`. The 3Dconnexion web integration and browser security behavior are more predictable over local HTTP than under `file://`.

## External dependencies

The example loads Babylon.js from the Babylon CDN:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
```

The 3Dconnexion script is loaded locally:

```html
<script src="./vendor/3dconnexion.min.js"></script>
```


## Design choices

### Right-handed Babylon scene

The scene uses:

```js
scene.useRightHandedSystem = true;
```

The 3Dconnexion web sample is Three.js-based, and Three.js uses a right-handed coordinate system. Using Babylon in right-handed mode avoids adding a Z-axis reflection bridge, which can cause issues.

### `setViewMatrix()` is used as the input stream

The 3Dconnexion API sends frequent `setViewMatrix()` callbacks. These callbacks are used as the primary 6-DOF input stream.

The code does not apply the received matrix as an absolute Babylon camera pose. Applying the SDK matrix directly can make translation remain attached to the original navigation frame after the camera rotates.

### Translation is applied as local camera motion

For each new `setViewMatrix()` callback, the code compares the current SDK view matrix with the previous SDK view matrix. It extracts the raw translation difference and treats that X/Y/Z difference as local SpaceMouse command components:

```text
raw SDK delta X -> camera-local right/left
raw SDK delta Y -> camera-local up/down
raw SDK delta Z -> camera-local forward/back
```

Those components are replayed on the current Babylon camera axes:

```js
const cameraRight = camera.getDirection(BABYLON.Axis.X).normalize();
const cameraUp = camera.getDirection(BABYLON.Axis.Y).normalize();
const cameraForward = camera.getDirection(BABYLON.Axis.Z).normalize();

const newPosition = camera.position
  .add(cameraRight.scale(dx))
  .add(cameraUp.scale(dy))
  .add(cameraForward.scale(dz));
```

Thus, after yawing, pitching, or rolling the camera, pushing the SpaceMouse forward moves along the current camera forward direction.

### Rotation is incremental

Rotation is also extracted as a delta between consecutive SDK matrices. That delta is multiplied into the current Babylon camera quaternion:

```js
const newRotation = camera.rotationQuaternion.multiply(deltaRotation);
newRotation.normalize();
```

The implementation normalizes quaternions and clamps large translation steps to avoid numerical drift and large jumps.

### `setTarget()` is logged but ignored for movement

The demo logs `setTarget()` events but does not use them for camera movement. In testing, the target stream behaved like an absolute navigation value and produced coupled X/Z translation after camera rotation. Using it for fly motion made forward/back movement unstable.

## Live log

The panel shows:

- connection status
- callback counters
- recent callback events
- local control deltas extracted from `setViewMatrix()`

Use **Download log** to save the recent event buffer as JSON.
