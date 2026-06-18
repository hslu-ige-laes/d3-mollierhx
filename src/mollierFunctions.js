// Functions for the Coordinate-transformations in the Mollier hx-diagram

// x has the unit kg/kg and y the unit °C.

// The y-axis is defined by y = (h-r_0*x)/c_pL such that the iso-enthalpy-
// lines are straight, equally spaced lines and the y-axis itself can be
// labelled with the temperature (at x=0, y=T exactly).

// Two coordinate conventions are supported:
//   'classical' — h normalised per kg of DRY air (Mollier 1923, Recknagel/
//                 Sprenger). Isotherms tilt slightly UP with x. T=0 isotherm
//                 is exactly horizontal.
//   'glueck'    — h normalised per kg of MOIST air (Glück: Zustands- und
//                 Stoffwerte). Isotherms tilt slightly DOWN with x; T=0
//                 isotherm is approximately horizontal with quadratic
//                 deviation in x.

// Constants are taken from Glück, ch. 2.1–2.2.

const c_pL = 1.01;    // kJ/(kg K) - specific heat capacity of: air,
const c_pW = 1.86;    // kJ/(kg K) - water,
const c_W_fl = 4.19;  // lK/(kg K) - and fluid water
const r_0  = 2501.0;  // kJ/kg
const k    = 0.6222;  // kg/kg - ratio between the molar masses of water and (dry) air
const R    = 8.3144;  // kJ/(kmol K) - universal gas constant
const R_W  = R/18.02; // kJ/(kg K)
const K_0C = 273.15;  // K
const C = [-4.909965*10**-4,+8.183197*10**-2,-5.552967*10**-4,-2.228376*10**-5,-6.211808*10**-7,
           -1.91275*10**-4,+7.258*10**-2,-2.939*10**-4,+9.841*10**-7,-1.92*10**-9];

const DEFAULT_CONVENTION = 'classical';


// ============================================================================
// Convention-independent functions
// ============================================================================
// These do not depend on how the (x,y) plane is parametrised.

function p_sat(t) { // Pa
	if(t < 0.01)
	return 611*Math.exp(C[0] + C[1]*t + C[2]*t**2 + C[3]*t**3 + C[4]*t**4);
	return 611*Math.exp(C[5] + C[6]*t + C[7]*t**2 + C[8]*t**3 + C[9]*t**4);
}

function log_p_sat(t) { // log(Pa) (useful for temperatur_p_sat(p_s))
	if(t < 0.01)
	return Math.log(611)+(C[0] + C[1]*t + C[2]*t**2 + C[3]*t**3 + C[4]*t**4);
	return Math.log(611)+(C[5] + C[6]*t + C[7]*t**2 + C[8]*t**3 + C[9]*t**4);
}

// Inverse transformation of p_sat(t). Application of the Newton-method
// to the function log_p_sat(t) for better convergence. It should converge
// after approx. 10 iteration steps.
function temperature_p_sat(p_s) { // returns t
	if(p_s < Math.exp(14.2)) {
		let log_p_s = Math.log(p_s);
		let t = 0;

		let p = log_p_sat(t)-log_p_s;
		let epsilon = 0.0001;

		let I = 0;
		while(Math.abs(p) > 0.001) {
			t = t - p*2*epsilon/(log_p_sat(t + epsilon) - log_p_sat(t - epsilon));
			p = log_p_sat(t)-log_p_s;
			I ++;
			if(I>100) { console.log("too many iterations!"); return null; }
		}
		return t;
	} else {
		console.log("too high preassure!");
		return null;
	}
}

function enthalpy(x,y) { // kJ/kg — h = r_0*x + c_pL*y by definition of y-axis.
	return r_0*x + c_pL*y;
}

function x_hy(h,y) { // returns x — convention-independent
	return (h-c_pL*y)/r_0;
}

function y_hx(h,x) { // returns y — convention-independent
	return (h-r_0*x)/c_pL;
}


// ============================================================================
// Factory: build a Mollier suite for a chosen convention
// ============================================================================

// Returns an object with all coordinate transforms bound to the chosen
// convention. The returned object also re-exports the convention-independent
// helpers above for convenience, so callers can do destructuring like
//   const { temperature, density, get_x_y, p_sat, enthalpy, ... } = createMollier();
function createMollier(convention) {
	convention = convention || DEFAULT_CONVENTION;
	if (convention !== 'classical' && convention !== 'glueck') {
		throw new Error("Unknown Mollier convention: " + convention);
	}

	// Convention-dependent low-level transforms
	const _y_to_t = convention === 'classical'
		? function(x, y) { return y*c_pL / (c_pL + x*c_pW); }
		: function(x, y) { return (y*c_pL*(1+x) + r_0*x*x) / (c_pL + x*c_pW); };

	const _t_to_y = convention === 'classical'
		? function(t, x) { return t*(c_pL + x*c_pW) / c_pL; }
		: function(t, x) { return (t*(c_pL + x*c_pW) - r_0*x*x) / (c_pL*(1+x)); };

	function temperature(x, y) { return _y_to_t(x, y); }

	function rel_humidity(x, y, p) { // in the interval [0,1]
		return x/(k+x)*p/p_sat(temperature(x, y));
	}

	function density(x, y, p) { // kg/m^3
		return p/(R_W*(K_0C + temperature(x, y)))*(1+x)/(k+x)/1000;
	}

	function get_x_y(t, phi, p) { // returns (x,y)
		let result = {};
		result.x = phi*k/(p/p_sat(t) - phi);
		result.y = _t_to_y(t, result.x);
		return result;
	}

	function get_x_y_tx(t, x, p) { // returns (x,y)
		return { x: x, y: _t_to_y(t, x) };
	}

	function get_x_y_phix(phi, x, p) { // returns (x,y)
		return { x: x, y: y_phix(phi, x, p) };
	}

	function get_x_y_phiy(phi, y, p) { // returns (x,y)
		return { x: x_phiy(phi, y, p), y: y };
	}

	function y_phix(phi, x, p) { // returns y
		return _t_to_y(temperature_p_sat(x*p/(phi*(k+x))), x);
	}

	// Application of the Newton-method to get x from phi and y - it
	// should converge after approx. 5 iteration steps.
	function x_phiy(phi, y, p) { // returns x
		let PHI = function(x) { return x/(k+x)*p/p_sat(temperature(x, y)); };
		let x = 0;
		let res = PHI(x) - phi;
		let epsilon = 0.000001;
		let I = 0;
		while(Math.abs(res) > 0.00001) {
			x = x - res*2*epsilon/(PHI(x + epsilon) - PHI(x - epsilon));
			res = PHI(x) - phi;
			I ++;
			if(I>100) { console.log("too many iterations!"); return null; }
		}
		return x;
	}

	function y_rhox(rho, x, p) { // returns y
		const t = p/(R_W*rho) * (1+x)/(k+x) * 0.001 - K_0C;
		return _t_to_y(t, x);
	}

	return {
		convention: convention,
		// convention-dependent
		temperature: temperature,
		rel_humidity: rel_humidity,
		density: density,
		get_x_y: get_x_y,
		get_x_y_tx: get_x_y_tx,
		get_x_y_phix: get_x_y_phix,
		get_x_y_phiy: get_x_y_phiy,
		y_phix: y_phix,
		x_phiy: x_phiy,
		y_rhox: y_rhox,
		// convention-independent (re-exported for convenience)
		enthalpy: enthalpy,
		x_hy: x_hy,
		y_hx: y_hx,
		p_sat: p_sat,
		log_p_sat: log_p_sat,
		temperature_p_sat: temperature_p_sat,
	};
}
