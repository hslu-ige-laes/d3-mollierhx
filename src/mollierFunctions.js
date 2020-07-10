// Functions for the coordinate-transformations in the Mollier hx-diagram

// x has the unit kg/kg and y the unit °C.

// The y-axis is defined by y = (h-r_0*x)/c_pL such that: firstly, the 
// coordinate-lines of h (lines of constant enthalpy h) are parallel and
// equally spaced and secondly the y-axis itself can be described by the
// temperature (the iso-temperature-lines cut the y-axis at the y-coord-
// inate of the same value as the temperature-value of those lines). 

// The system of coordinates (x,h) is on purpose not orthogonal. The angle
// between x and h are chosen such that the iso-temperature-line of T=0 
// (T is the temperature) is approximatively a constant function of x. In 
// fact, the deviation is quadratic in x. The reason for this is, that one
// works often with temperature scales, which are better visible with this
// extra transformation.

// In order to understand the origin of the functions in this document, 
// please consult chapter 2.1 and 2.2 of "Glück: Zustands- und Stoffwerte 
// - Wasser - Dampf - Luft". The following constants come from this doc-
// ument too.

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
           

// The paremeters of the functions have following units:

// absolute humidity x:     [x] = kg/kg
// y-axis y:                [y] = °C
// pressure p:              [p] = Pa = N/m^2
// temperature t:           [t] = °C
// relative humidity phi:   [phi] = 'none', phi is in the interval [0,1]
// saturation pressure p_s: [p_s] = Pa
// enthalpy h:              [h] = kJ/kg
// density rho:             [rho] = kg/m^3

function enthalpy(x,y) { // kJ/kg
	return r_0*x + c_pL*y;
}

function temperature(x,y) { // °C
	// here could be further handled the case of x>xs.
    return (y*c_pL*(1+x) + r_0*x**2)/(c_pL + x*c_pW);
    
    //return y*c_pL/(c_pL + x*c_pW); // if the enthalpy should be given relatively
    // to the mass of dry air...
}

function rel_humidity(x,y,p) { // in the interval [0,1]
	return x/(k+x)*p/p_sat(temperature(x,y));
}

function density(x,y,p) { // kg/m^3
	return p/(R_W*(K_0C + temperature(x,y)))*(1+x)/(k+x)/1000;
}

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

function get_x_y(t,phi,p) { // returns (x,y)
	let result = {};
	result.x = phi*k/(p/p_sat(t) - phi);
	result.y = (t*(c_pL + result.x*c_pW) - r_0*result.x*result.x)/(c_pL*(1+result.x));
	return result;
}

function get_x_y_tx(t,x,p) { // returns (x,y)
	let result = {};
	result.x = x;
	result.y = (t*(c_pL + x*c_pW) - r_0*x*x)/(c_pL*(1+x));
	return result;
}

function get_x_y_phix(phi,x,p) { // returns (x,y)
	let result = {};
	result.x = x;
	result.y = y_phix(phi,x,p);
	return result;
}

function get_x_y_phiy(phi,y,p) { // returns (x,y)
	let result = {};
	result.x = x_phiy(phi,y,p);
	result.y = y;
	return result;
}

function y_phix(phi,x,p) { // returns y
	return (c_pL + x*c_pW)/(c_pL*(1+x))*(temperature_p_sat(x*p/(phi*(k+x))) - r_0*x**2/(c_pL + x*c_pW));
}

// Application of the Newton-method to get x from phi and y - it
// should converge after approx. 5 iteration steps.
function x_phiy(phi,y,p) { // returns x
	let PHI = function(x) { return x/(k+x)*p/p_sat(temperature(x,y)); };
	let x = 0;

	let res = PHI(x) - phi;
	let epsilon = 0.000001;

	let I = 0;
	while(Math.abs(res) > 0.00001) {
		x = x - res*2*epsilon/(PHI(x + epsilon) - PHI(x-epsilon));
		res = PHI(x) - phi;
		I ++;
		if(I>100) { console.log("too many iterations!"); return null; }
	}
	return x;
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

function x_hy(h,y) { // returns x
	return (h-c_pL*y)/r_0;
}

function y_hx(h,x) { // returns y
	return (h-r_0*x)/c_pL;
}

function y_rhox(rho,x,p) { // returns y
	return (c_pL + x*c_pW)/(c_pL*(1+x))*(p/(R_W*rho)*(1+x)/(k+x)*0.001 - K_0C - r_0*x**2/(c_pL + x*c_pW));
}