import { NoiseNode } from './noise-node.js';

const App = angular.module('App', []);

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

App.filter('oscillatorType', function () {
	return function (v) {
		if (!v) return '';
		return v.substring(0, 1).toUpperCase() + v.substring(1);
	};
});

App.directive('fft', function () {
	return {
		scope: {
			"fft": "="
		},
		controller: function ($scope, $element) {
			$scope.fft = {
				start: function (context, node) {
					this.context = context;
					this.node = node;
					this.canvas = $element.find('canvas')[0];
					this.analyser = context.createAnalyser();
					this.analyser.fftSize = 2048;
					this.node.connect(this.analyser);

					const ctx = this.canvas.getContext('2d');
					const analyser = this.analyser;
					const data = new Float32Array(analyser.frequencyBinCount);
					const range = analyser.minDecibels - analyser.maxDecibels;

					const draw = () => {
						if (!this.running) return;
						analyser.getFloatFrequencyData(data);
						ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
						ctx.fillStyle = "#000000";
						for (let i = 0, len = data.length; i < len; i++) {
							const x = (data[i] - analyser.maxDecibels) / range;
							ctx.fillRect(i, 0, 1, this.canvas.height * x);
						}
						requestAnimationFrame(draw);
					};

					if (this.running) return;
					this.running = true;
					requestAnimationFrame(draw);
				},

				stop: function () {
					this.running = false;
					if (this.node && this.analyser) {
						this.node.disconnect(this.analyser);
					}
				}
			};
		},
		template: '<canvas id="canvas" width="1024" height="200" style="max-width: 100%; border: 1px solid #000;"></canvas>'
	};
});

App.controller('MainCtrl', function ($scope, $timeout) {
	const signalGenerator = new SignalGenerator();
	$scope.oscillators = [];
	$scope.playing = false;

	$scope.$watch('oscillators', function (newValue) {
		for (let i = 0; i < newValue.length; i++) {
			signalGenerator.update(newValue[i]);
		}
	}, true);

	$scope.append = function () {
		const config = {
			type: "sine",
			frequency: 440,
			gain: 0.1
		};
		$scope.oscillators.push(config);
		signalGenerator.append(config);
	};

	$scope.remove = function (osc) {
		const index = $scope.oscillators.indexOf(osc);
		if (index !== -1) {
			$scope.oscillators.splice(index, 1);
			signalGenerator.remove(osc);
		}
	};

	$scope.start = async function () {
		await signalGenerator.start();
		$scope.$apply(() => {
			$scope.playing = true;
			if ($scope.fftEnabled) {
				$scope.fft.start(signalGenerator.context, signalGenerator.gain);
			}
		});
	};

	$scope.stop = function () {
		signalGenerator.stop();
		$scope.playing = false;
	};

	$timeout(() => {
		$scope.$watch('fftEnabled', function (newValue) {
			if (newValue) {
				if (signalGenerator.context) {
					$scope.fft.start(signalGenerator.context, signalGenerator.gain);
				}
			} else {
				if ($scope.fft) {
					$scope.fft.stop();
				}
			}
		});
	}, 100);

	$scope.append();
});