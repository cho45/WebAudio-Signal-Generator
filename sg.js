import { NoiseNode } from './noise-node.js';
import { createApp, ref, reactive, watch, onMounted, onUnmounted, nextTick } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

class SignalGenerator {
	constructor() {
		this.configs = [];
		this.context = null;
		this.nodes = [];
		this.gain = null;
		this.playing = false;
	}

	append(config) {
		if (this._index(config) !== null) throw new Error("already appended config");
		this.configs.push(config);
		if (this.context) {
			const node = {};
			this._set(node, config);
			this.nodes.push(node);
		}
	}

	update(config) {
		const index = this._index(config);
		if (index !== null && this.nodes[index]) {
			this._set(this.nodes[index], config);
		}
	}

	remove(config) {
		const index = this._index(config);
		if (index === null) return;
		this.configs.splice(index, 1);
		if (this.nodes[index]) {
			const node = this.nodes[index];
			if (node.osc) node.osc.disconnect();
			if (node.gain) node.gain.disconnect();
			this.nodes.splice(index, 1);
		}
	}

	async start() {
		if (!this.context) {
			this.context = new AudioContext();
			await NoiseNode.addModule(this.context);
			this.nodes = [];
			this.gain = this.context.createGain();
			this.gain.gain.value = 0;
			this.gain.connect(this.context.destination);
			for (const config of this.configs) {
				const node = {};
				this._set(node, config);
				this.nodes.push(node);
			}
		}

		if (this.context.state === 'suspended') {
			await this.context.resume();
		}

		this.playing = true;
		this.gain.gain.setTargetAtTime(1, this.context.currentTime, 0.01);
	}

	stop() {
		this.playing = false;
		if (this.gain && this.context) {
			this.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
		}
	}

	_index(config) {
		for (let i = 0; i < this.configs.length; i++) {
			if (this.configs[i] === config) {
				return i;
			}
		}
		return null;
	}

	_set(node, config) {
		if (!this.context) return;

		if (!node.gain) {
			node.gain = this.context.createGain();
			node.gain.connect(this.gain);
		}

		const isNoise = config.type.match(/noise/);

		if (isNoise) {
			if (!(node.osc instanceof NoiseNode) || node.osc.type !== config.type) {
				if (node.osc) node.osc.disconnect();
				node.osc = new NoiseNode(this.context, { type: config.type });
				node.osc.connect(node.gain);
				node.osc.type = config.type;
			}
		} else {
			if (!(node.osc instanceof OscillatorNode)) {
				if (node.osc) node.osc.disconnect();
				node.osc = this.context.createOscillator();
				node.osc.start(0);
				node.osc.connect(node.gain);
			}
			node.osc.type = config.type;
			node.osc.frequency.setTargetAtTime(config.frequency, this.context.currentTime, 0.01);
		}

		node.gain.gain.setTargetAtTime(config.gain, this.context.currentTime, 0.01);
	}
}

const Visualizer = {
	props: ['context', 'source', 'enabled'],
	setup(props) {
		const canvasRef = ref(null);
		let analyser = null;
		let animationId = null;

		const draw = () => {
			if (!props.enabled || !analyser || !canvasRef.value) return;
			const canvas = canvasRef.value;
			const ctx = canvas.getContext('2d');
			const data = new Float32Array(analyser.frequencyBinCount);
			
			// 正しいレンジ計算: maxDecibels(-30) - minDecibels(-100) = 70
			const min = analyser.minDecibels;
			const max = analyser.maxDecibels;
			const range = max - min;

			analyser.getFloatFrequencyData(data);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = "#42b983";
			
			const barWidth = canvas.width / data.length;
			for (let i = 0, len = data.length; i < len; i++) {
				// デシベル値を 0.0 ~ 1.0 に正規化 (loud = 1.0, quiet = 0.0)
				const val = (data[i] - min) / range;
				const h = canvas.height * Math.max(0, val);
				// 下から上に向かって描画
				ctx.fillRect(i * barWidth, canvas.height - h, barWidth, h);
			}
			animationId = requestAnimationFrame(draw);
		};

		const init = async () => {
			await nextTick();
			if (props.enabled && props.context && props.source && canvasRef.value) {
				analyser = props.context.createAnalyser();
				analyser.fftSize = 2048;
				props.source.connect(analyser);
				draw();
			}
		};

		const cleanup = () => {
			if (animationId) cancelAnimationFrame(animationId);
			if (props.source && analyser) {
				try { props.source.disconnect(analyser); } catch(e) {}
			}
			analyser = null;
		};

		onMounted(() => init());
		onUnmounted(() => cleanup());

		watch(() => [props.enabled, props.context, props.source], () => {
			cleanup();
			init();
		});

		return { canvasRef };
	},
	template: `<canvas ref="canvasRef" width="1024" height="200" class="visualizer-canvas"></canvas>`
};

const app = createApp({
	components: { Visualizer },
	setup() {
		const signalGenerator = new SignalGenerator();
		const oscillators = reactive([]);
		const playing = ref(false);
		const fftEnabled = ref(false);
		const context = ref(null);
		const gainNode = ref(null);

		const append = () => {
			const config = reactive({
				type: "sine",
				frequency: 440,
				gain: 0.1
			});
			oscillators.push(config);
			signalGenerator.append(config);
		};

		const remove = (osc) => {
			const index = oscillators.indexOf(osc);
			if (index !== -1) {
				oscillators.splice(index, 1);
				signalGenerator.remove(osc);
			}
		};

		const start = async () => {
			await signalGenerator.start();
			playing.value = true;
			context.value = signalGenerator.context;
			gainNode.value = signalGenerator.gain;
		};

		const stop = () => {
			signalGenerator.stop();
			playing.value = false;
		};

		watch(oscillators, (newVal) => {
			newVal.forEach(osc => signalGenerator.update(osc));
		}, { deep: true });

		onMounted(() => {
			append();
		});

		return {
			oscillators,
			playing,
			fftEnabled,
			context,
			gainNode,
			append,
			remove,
			start,
			stop
		};
	}
});

app.mount('#app');