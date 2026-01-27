const contextModules = new WeakSet();

export class NoiseNode extends AudioWorkletNode {
	constructor(context, opts) {
		super(context, 'noise-processor', {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			channelCount: 1,
			channelCountMode: "explicit",
			channelInterpretation: "discrete",
			outputChannelCount: [1],
			processorOptions: {
				type: opts.type || 'whitenoise'
			}
		});
		this.type = opts.type || 'whitenoise';
	}

	static async addModule(context) {
		if (contextModules.has(context)) return;

		const processor = (() => {
			// AudioWorkletGlobalScope
			class NoiseProcessor extends AudioWorkletProcessor {
				constructor(opts) {
					super();
					this.type = opts.processorOptions.type;
					this.states = [];

					const createGaussianNoise = () => {
						let spare = null;
						return () => {
							if (spare !== null) {
								const tmp = spare;
								spare = null;
								return tmp;
							}
							const a = 1.0 - Math.random(), b = Math.random();
							const common = Math.sqrt(-2 * Math.log(a));
							spare = common * Math.cos(2 * Math.PI * b);
							return common * Math.sin(2 * Math.PI * b);
						};
					};

					const createWhiteNoise = () => {
						const gaussian = createGaussianNoise();
						return (chData) => {
							for (let i = 0; i < chData.length; i++) {
								chData[i] = gaussian();
							}
						};
					};

					const createPinkNoise = () => {
						const gaussian = createGaussianNoise();
						let x0 = 0, x1 = 0, x2 = 0, x3 = 0, x4 = 0, x5 = 0, x6 = 0;
						return (chData) => {
							for (let i = 0; i < chData.length; i++) {
								const white = gaussian();
								x0 = 0.99886 * x0 + white * 0.0555179;
								x1 = 0.99332 * x1 + white * 0.0750759;
								x2 = 0.96900 * x2 + white * 0.1538520;
								x3 = 0.86650 * x3 + white * 0.3104856;
								x4 = 0.55000 * x4 + white * 0.5329522;
								x5 = -0.7616 * x5 - white * 0.0168980;
								const pink = x0 + x1 + x2 + x3 + x4 + x5 + x6 + white * 0.5362;
								x6 = white * 0.115926;
								chData[i] = pink * 0.15;
							}
						};
					};

					const createBrownNoise = () => {
						const gaussian = createGaussianNoise();
						let brown = 0;
						return (chData) => {
							for (let i = 0; i < chData.length; i++) {
								const white = gaussian();
								brown = 0.99 * brown + white;
								chData[i] = brown * 0.06;
							}
						};
					};

					this.createGenerator = {
						whitenoise: createWhiteNoise,
						pinknoise: createPinkNoise,
						browniannoise: createBrownNoise
					}[this.type];

					if (!this.createGenerator) throw new Error(`unsupported noise type ${this.type}`);
				}

				process(inputs, outputs, _parameters) {
					const output = outputs[0];

					for (let ch = 0; ch < output.length; ch++) {
						if (!this.states[ch]) {
							this.states[ch] = this.createGenerator();
						}
						this.states[ch](output[ch]);
					}

					return true;
				}
			}

			registerProcessor('noise-processor', NoiseProcessor);
		}).toString();

		const url = URL.createObjectURL(new Blob(['(', processor, ')()'], { type: 'application/javascript' }));
		await context.audioWorklet.addModule(url);
		contextModules.add(context);
		URL.revokeObjectURL(url);
	}
}
