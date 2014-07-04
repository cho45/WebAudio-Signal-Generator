var App = angular.module('App', []);

navigator.getMedia = (
	navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia ||
	navigator.msGetUserMedia
);

window.AudioContext = (
	window.AudioContext ||
	window.webkitAudioContext ||
	window.mozAudioContext ||
	window.msAudioContext
);

(function() {
	var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
	window.requestAnimationFrame = requestAnimationFrame;
})();

SignalGenerator = function () { this.init.apply(this, arguments) };
SignalGenerator.prototype = {
	init : function () {
		var self = this;
		self.context = new AudioContext();
		self.nodes = [];
		self.configs = [];
		self.gain = self.context.createGain();
		self.gain.gain.value = 0;
		self.gain.connect(self.context.destination);
	},

	append : function (config) {
		var self = this;
		if (self._index(config) !== null) throw "already appended config";

		var node = { };

		self._set(node, config);

		self.configs.push(config);
		self.nodes.push(node);
	},

	update : function (config) {
		var self = this;
		var node = self.nodes[self._index(config)];
		self._set(node, config);
	},

	remove : function (config) {
		var self = this;
		var index = self._index(config);
		var node = self.nodes[index];
		node.osc.disconnect();
		self.nodes.splice(index, 1);
		self.configs.splice(index, 1);
	},

	start : function () {
		var self = this;
		self.playing = true;
		self.gain.gain.value = 1;
	},

	stop : function () {
		var self = this;
		self.playing = false;
		self.gain.gain.value = 0;
	},

	_index : function (config) {
		var self = this;
		for (var i = 0, it; (it = self.configs[i]); i++) {
			if (self.configs[i] === config) {
				return i;
			}
		}
		return null;
	},

	_set : function (node, config) {
		var self = this;
		if (!node.gain) node.gain = self.context.createGain();

		if (config.type == 'whitenoise') {
			node.osc.disconnect();
			var variance = 1;
			var average = 0;
			node.osc = self.context.createScriptProcessor(4096, 1, 1);
			node.osc.onaudioprocess = function (e) {
				var inputData = e.inputBuffer.getChannelData(0);
				var outputData = e.outputBuffer.getChannelData(0);
				for (var i = 0, len = inputData.length; i < len; i += 2) {
					// Whitenoise by Box-Muller transform
					var a = Math.random(), b = Math.random();
					var x = Math.sqrt(-2 * Math.log(a)) * Math.sin(2 * Math.PI * b) * variance + average;
					var y = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b) * variance + average;
					outputData[i]   = x;
					outputData[i+1] = y;
				}
			};

			node.osc.connect(node.gain);
		} else
		if (config.type == "pinknoise") {
			var x0, x1, x2, x3, x4, x5, x6;
			x0 = x1 = x2 = x3 = x4 = x5 = x6 = 0.0;
			var pinkify = function (white) {
				x0 = 0.99886 * x0 + white * 0.0555179;
				x1 = 0.99332 * x1 + white * 0.0750759;
				x2 = 0.96900 * x2 + white * 0.1538520;
				x3 = 0.86650 * x3 + white * 0.3104856;
				x4 = 0.55000 * x4 + white * 0.5329522;
				x5 = -0.7616 * x5 - white * 0.0168980;
				var pink = x0 + x1 + x2 + x3 + x4 + x5 + x6 + white * 0.5362;
				x6 = white * 0.115926;
				return pink;
			};

			node.osc.disconnect();
			node.osc = self.context.createScriptProcessor(1024, 1, 1);
			node.osc.onaudioprocess = function (e) {
				// http://www.firstpr.com.au/dsp/pink-noise/
				var inputData = e.inputBuffer.getChannelData(0);
				var outputData = e.outputBuffer.getChannelData(0);

				for (var i = 0, len = inputData.length; i < len; i += 2) {
					// Whitenoise by Box-Muller transform
					var a = Math.random(), b = Math.random();
					var x = Math.sqrt(-2 * Math.log(a)) * Math.sin(2 * Math.PI * b);
					var y = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
					outputData[i]   = pinkify(x);
					outputData[i+1] = pinkify(y);
				}
			};

			node.osc.connect(node.gain);
		} else
		if (config.type == 'browniannoise') {
			var brown = 0.0;
			var brownify = function (white) {
				brown += white;
				if (brown < -10) {
					brown = -10 - (brown + 10);
				} else
				if (10 < brown) {
					brown = 10 - (brown - 10);
				}
				return brown / 5;
			};

			node.osc.disconnect();
			node.osc = self.context.createScriptProcessor(1024, 1, 1);
			node.osc.onaudioprocess = function (e) {
				var inputData = e.inputBuffer.getChannelData(0);
				var outputData = e.outputBuffer.getChannelData(0);
				for (var i = 0, len = inputData.length; i < len; i += 2) {
					// Whitenoise by Box-Muller transform
					var a = Math.random(), b = Math.random();
					var x = Math.sqrt(-2 * Math.log(a)) * Math.sin(2 * Math.PI * b);
					var y = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
					// Integrate
					outputData[i]   = brownify(x);
					outputData[i+1] = brownify(y);
				}
			};

			node.osc.connect(node.gain);
		} else {
			if (!(node.osc instanceof OscillatorNode)) {
				if (node.osc) node.osc.disconnect();
				node.osc = self.context.createOscillator();
				node.osc.start(0);
			}
			node.osc.connect(node.gain);
			node.osc.type = config.type;
			node.osc.frequency.value = config.frequency;
		}
		node.gain.gain.value = config.gain;
		node.gain.connect(self.gain);
	}
};

App.filter('oscillatorType', function () {
	return function (v) {
		return v.substring(0, 1).toUpperCase() + v.substring(1);
	};
});

App.directive('fft', function () {
	return {
		scope : {
			"fft" : "="
		},
		controller : function ($scope, $element, $attrs) {
			console.log('controller');
			$scope.fft = {
				init : function (context, node) {
					this.context = context;
					this.node = node;
					this.canvas = $element.find('canvas')[0];
					this.analyser = context.createAnalyser();
					this.analyser.fftSize = 2048;
					this.node.connect(this.analyser);

					var ctx    = this.canvas.getContext('2d');
					var analyser = this.analyser;
					var data = new Float32Array(analyser.frequencyBinCount);
					var range = analyser.minDecibels - analyser.maxDecibels; // -70
					this.draw = function () {
						analyser.getFloatFrequencyData(data);
						ctx.clearRect(0, 0, canvas.width, canvas.height);
						ctx.fillStyle = "#000000";
						for (var i = 0, len = data.length; i < len; i++) {
							var x = (data[i] - analyser.maxDecibels) / range;
							ctx.fillRect(i, 0, 1, canvas.height * x);
						}
					};
				},

				start : function () {
					var self = this;
					if (self.running) return;
					self.running = true;
					requestAnimationFrame(function () {
						if (!self.running) return;
						self.draw();
						requestAnimationFrame(arguments.callee);
					});
				},

				stop : function () {
					this.running = false;
				}
			};
		},
		template : '<canvas id="canvas" width="1024" height="200" style="max-width: 100%; border: 1px solid #000;"></canvas>'
	};
});

App.controller('MainCtrl', function ($scope, $timeout) {
	var signalGenerator = new SignalGenerator();
	$scope.oscillators = [ ];
	$scope.playing = false;
	console.log('Main', $scope.$id);

	$timeout(function () {
		$scope.fft.init(signalGenerator.context, signalGenerator.gain);
		$scope.$watch('fftEnabled', function (newValue) {
			if (newValue) {
				$scope.fft.start();
			} else {
				$scope.fft.stop();
			}
		});
	}, 10);

	$scope.$watch('oscillators', function (newValue, oldValue) {
		console.log(newValue);
		for (var i = 0, it; (it = newValue[i]); i++) {
			signalGenerator.update(newValue[i]);
		}
	}, true);

	$scope.append = function () {
		var config = {
			type : "sine",
			frequency : 600,
			gain : 0.1
		};
		$scope.oscillators.push(config);
		signalGenerator.append(config);
	};

	$scope.remove = function (osc) {
		for (var i = 0, it; (it = $scope.oscillators[i]); i++) {
			if (it === osc) {
				$scope.oscillators.splice(i, 1);
				signalGenerator.remove(osc);
				break;
			}
		}
	};

	$scope.start = function () {
		signalGenerator.start();
		$scope.playing = true;
	};

	$scope.stop = function () {
		signalGenerator.stop();
		$scope.playing = false;
	};

	$scope.append();
});
