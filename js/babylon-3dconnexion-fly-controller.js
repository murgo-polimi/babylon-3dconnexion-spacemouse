(function (global) {
  'use strict';

  const DEFAULTS = {
    maxTranslationStep: 0.08,
    logSize: 1000,
    create3dmouseName: 'Babylon SpaceMouse fly navigation',
    enableKeyboardMouseCamera: true,
    onStatus: null,
    onLog: null,
  };

  function toArray16(m) {
    if (m && typeof m.asArray === 'function') return Array.prototype.slice.call(m.asArray(), 0, 16);
    return Array.prototype.slice.call(m, 0, 16);
  }

  function fromArray16(a) {
    const m = BABYLON.Matrix.Identity();
    BABYLON.Matrix.FromArrayToRef(a, 0, m);
    return m;
  }

  function finiteVector(v) {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  }

  function finiteQuaternion(q) {
    return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
  }

  function round6(x) {
    return typeof x === 'number' ? Number(x.toFixed(6)) : x;
  }

  function cleanWorldMatrix(world) {
    const scale = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();
    world.decompose(scale, rotation, position);
    rotation.normalize();

    const cleaned = BABYLON.Matrix.Identity();
    BABYLON.Matrix.ComposeToRef(new BABYLON.Vector3(1, 1, 1), rotation, position, cleaned);
    return { world: cleaned, rotation, position };
  }

  function matrixStats(a) {
    return {
      m12: round6(a[12]),
      m13: round6(a[13]),
      m14: round6(a[14]),
      m15: round6(a[15]),
    };
  }

  function cameraState(camera) {
    camera.computeWorldMatrix(true);
    const q = camera.rotationQuaternion || BABYLON.Quaternion.Identity();
    return {
      position: [round6(camera.position.x), round6(camera.position.y), round6(camera.position.z)],
      rotationQuaternion: [round6(q.x), round6(q.y), round6(q.z), round6(q.w)],
      viewMatrix: toArray16(camera.getViewMatrix()).map(round6),
    };
  }

  class Babylon3DconnexionFlyController {
    constructor(options) {
      if (!global.BABYLON) throw new Error('BABYLON is not loaded.');
      if (!global._3Dconnexion) throw new Error('3dconnexion.min.js is not loaded.');
      if (!options || !options.canvas || !options.camera) {
        throw new Error('canvas and camera are required.');
      }

      this.canvas = options.canvas;
      this.camera = options.camera;
      this.scene = options.scene || this.camera.getScene();
      this.options = Object.assign({}, DEFAULTS, options);
      this.log = [];
      this.counters = { viewMatrix: 0, target: 0, errors: 0 };
      this.previousDriverView = null;
      this.connexion = null;

      this.camera.rotationQuaternion = this.camera.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(
        this.camera.rotation.x,
        this.camera.rotation.y,
        this.camera.rotation.z
      );

      if (this.options.enableKeyboardMouseCamera && this.camera.attachControl) {
        this.camera.attachControl(this.canvas, true);
      }
    }

    connect() {
      const client = this._createClient();
      this.connexion = new _3Dconnexion(client);
      this.connexion.connect();
      this._status('connecting');
    }

    reset(position, rotationQuaternion) {
      this.camera.position.copyFrom(position || new BABYLON.Vector3(0, 2, -10));
      this.camera.rotationQuaternion.copyFrom(rotationQuaternion || BABYLON.Quaternion.Identity());
      this.camera.computeWorldMatrix(true);
      this.previousDriverView = toArray16(this.camera.getViewMatrix());
      this._record('reset', {}, null, cameraState(this.camera));
    }

    downloadLog(filename) {
      const payload = {
        createdAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        babylonVersion: BABYLON.Engine.Version,
        counters: this.counters,
        finalCamera: cameraState(this.camera),
        samples: this.log,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `babylon-3dconnexion-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    _createClient() {
      return {
        onConnect: () => {
          this._status('connected');
          this._create3dmouse();
        },
        onDisconnect: (reason) => this._status(`disconnected: ${reason}`),
        on3dmouseCreated: () => {
          this.canvas.focus();
          this._status('3D mouse ready');
        },

        getViewMatrix: () => this._getViewMatrix(),
        setViewMatrix: (viewMatrix) => this._setViewMatrix(viewMatrix),

        getViewTarget: () => this._lookAt(10),
        setTarget: (target) => {
          this.counters.target += 1;
          this._record('setTarget', { target });
        },

        getPerspective: () => true,
        getFov: () => this.camera.fov,
        setFov: (fov) => {
          if (typeof fov === 'number' && fov > 0.01 && fov < Math.PI) this.camera.fov = fov;
        },
        getViewExtents: () => [80, 80, 80],
        getModelExtents: () => [-40, -1, -40, 40, 20, 40],
        getConstructionPlane: () => this._identity(),
        getSelectionAffine: () => this._identity(),
        getSelectionEmpty: () => true,
        getSelectionExtents: () => [0, 0, 0, 0, 0, 0],
        getCoordinateSystem: () => 'right-handed',
        getFrontView: () => this._identity(),
        getFloorPlane: () => [0, 1, 0, 0],
        getUnitsToMeters: () => 1,
        getPivotPosition: () => this._lookAt(5),
        setPivotPosition: (v) => this._record('setPivotPosition', { value: v }),
        setPivotVisible: (v) => this._record('setPivotVisible', { value: v }),
        getLookAt: () => this._lookAt(10),
        setLookFrom: (v) => this._record('setLookFrom', { value: v }),
        setLookDirection: (v) => this._record('setLookDirection', { value: v }),
        setLookAperture: (v) => this._record('setLookAperture', { value: v }),
        setTransaction: (v) => this._record('setTransaction', { value: v }),
        setMoving: (v) => this._record('setMoving', { value: v }),
        setActiveCommand: (v) => this._record('setActiveCommand', { value: v }),
        setKeyPress: (v) => this._record('setKeyPress', { value: v }),
        setKeyRelease: (v) => this._record('setKeyRelease', { value: v }),
        setSettingsChanged: (v) => this._record('setSettingsChanged', { value: v }),
        getPointerPosition: () => [0, 0],
        getFrameTimingSource: () => 'requestAnimationFrame',
        getFrameTime: () => performance.now() / 1000,
      };
    }

    _create3dmouse() {
      try {
        this.connexion.create3dmouse(this.canvas, this.options.create3dmouseName, 0);
      } catch (error) {
        this.counters.errors += 1;
        this._status(`create3dmouse error: ${error.message || error}`);
      }
    }

    _getViewMatrix() {
      this.previousDriverView = toArray16(this.camera.getViewMatrix());
      this._record('getViewMatrix', { stats: matrixStats(this.previousDriverView) });
      return this.previousDriverView.slice();
    }

    _setViewMatrix(viewMatrix) {
      this.counters.viewMatrix += 1;
      const currentView = toArray16(viewMatrix);
      const before = cameraState(this.camera);

      try {
        if (!this.previousDriverView) {
          this.previousDriverView = currentView.slice();
          this._record('setViewMatrixInit', { stats: matrixStats(currentView) }, before, cameraState(this.camera));
          return;
        }

        const previousWorld = fromArray16(this.previousDriverView).invert();
        const currentWorld = fromArray16(currentView).invert();
        const previousClean = cleanWorldMatrix(previousWorld);
        const currentClean = cleanWorldMatrix(currentWorld);

        const rawDelta = currentClean.position.subtract(previousClean.position);
        const dx = rawDelta.x;
        const dy = rawDelta.y;
        const dz = rawDelta.z;

        const stepLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const maxStep = this.options.maxTranslationStep;
        const scale = stepLength > maxStep ? maxStep / stepLength : 1;

        const camRight = this.camera.getDirection(BABYLON.Axis.X).normalize();
        const camUp = this.camera.getDirection(BABYLON.Axis.Y).normalize();
        const camForward = this.camera.getDirection(BABYLON.Axis.Z).normalize();

        const newPosition = this.camera.position
          .add(camRight.scale(dx * scale))
          .add(camUp.scale(dy * scale))
          .add(camForward.scale(dz * scale));

        const inversePreviousWorld = previousClean.world.clone().invert();
        const localDelta = inversePreviousWorld.multiply(currentClean.world);
        const deltaScale = new BABYLON.Vector3();
        const deltaRotation = new BABYLON.Quaternion();
        const deltaPosition = new BABYLON.Vector3();
        localDelta.decompose(deltaScale, deltaRotation, deltaPosition);
        deltaRotation.normalize();

        const newRotation = this.camera.rotationQuaternion.multiply(deltaRotation);
        newRotation.normalize();

        if (finiteVector(newPosition) && finiteQuaternion(newRotation)) {
          this.camera.position.copyFrom(newPosition);
          this.camera.rotationQuaternion.copyFrom(newRotation);
          this.camera.computeWorldMatrix(true);
        }

        this.previousDriverView = currentView.slice();
        this._record('setViewMatrix', {
          rawMatrixStats: matrixStats(currentView),
          localTranslation: {
            dx: round6(dx * scale),
            dy: round6(dy * scale),
            dz: round6(dz * scale),
            stepLength: round6(stepLength),
            scale: round6(scale),
          },
        }, before, cameraState(this.camera));
      } catch (error) {
        this.counters.errors += 1;
        this._record('error', { message: error.message || String(error) }, before, cameraState(this.camera));
      }
    }

    _lookAt(distance) {
      const forward = this.camera.getDirection(BABYLON.Axis.Z).normalize();
      const target = this.camera.position.add(forward.scale(distance));
      return [target.x, target.y, target.z];
    }

    _identity() {
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }

    _status(message) {
      if (typeof this.options.onStatus === 'function') this.options.onStatus(message, this.counters);
    }

    _record(type, payload, before, after) {
      const entry = {
        tMs: round6(performance.now()),
        type,
        payload: payload || {},
        cameraBefore: before || null,
        cameraAfter: after || cameraState(this.camera),
      };
      this.log.push(entry);
      if (this.log.length > this.options.logSize) this.log.shift();
      if (typeof this.options.onLog === 'function') this.options.onLog(entry, this.counters);
    }
  }

  global.Babylon3DconnexionFlyController = Babylon3DconnexionFlyController;
})(window);
