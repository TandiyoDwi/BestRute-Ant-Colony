 // Constants and Configuration
 const apiKey = "5b3ce3597851110001cf6248ac1fd4f3ec63424c8f1afa6cbaf5ef12";
 const locations = [
   { name: "Permana Cabe", lat: -8.13907717657893, lon: 112.19250106932807, demand: 500 },
   { name: "Pasar Kademangan", lat: -8.143956075310417, lon: 112.14555814850499, demand: 300 },
   { name: "Pasar Legi", lat: -8.087124377934913, lon: 112.1555671256592, demand: 400 },
   { name: "Pasar Templek", lat: -8.100156047361384, lon: 112.15977622404095, demand: 250 },
   { name: "Ekspedisi Prabowo Bersaudara", lat: -8.056654057735447, lon: 112.15105694612548, demand: 350 }
   //{ name: "Pondok Lansia", lat: -8.108278152746191, lon: 112.2492611854665, demand: 350 }
 ];
 
 const vehicleTypes = {
   truck: { 
     speed: 35,
     alternativeSpeed: 25,
     capacity: 2000,
     icon: "🚛",
     loadingTime: 30,
     fuelConsumption: 0.25
   },
   pickup: { 
     speed: 45,
     alternativeSpeed: 35,
     capacity: 1000,
     icon: "🚐",
     loadingTime: 15,
     fuelConsumption: 0.15
   }
 };
 
 // Utility Functions
 function calculateTotalMetrics(route, details, vehicleType) {
   const vehicle = vehicleTypes[vehicleType];
   const totalDistance = details.distances.reduce((sum, dist) => sum + dist, 0);
   const totalTime = details.times.reduce((sum, time) => sum + time, 0);
   const totalLoadingTime = (route.length - 2) * (vehicle.loadingTime / 60);
   const fuelConsumption = totalDistance * vehicle.fuelConsumption;
   
   return {
     distance: totalDistance,
     time: totalTime + totalLoadingTime,
     fuelConsumption: fuelConsumption,
     alternativeRoutes: details.isAlternative.filter(isAlt => isAlt).length
   };
 }
 
 async function fetchRoute(coordinates, isAlternative = false) {
   try {
     const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
     const response = await fetch(url, {
       method: "POST",
       headers: {
         "Authorization": apiKey,
         "Content-Type": "application/json"
       },
       body: JSON.stringify({
         coordinates,
         options: {
           avoid_features: isAlternative ? [] : ["highways"]
         }
       })
     });
 
     if (!response.ok) throw new Error("Failed to fetch route");
     
     const data = await response.json();
     return {
       coordinates: data.features[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]),
       distance: data.features[0].properties.segments[0].distance,
       duration: data.features[0].properties.segments[0].duration
     };
   } catch (error) {
     console.error("Error fetching route:", error);
     return null;
   }
 }
 
 // Main ACO Class
 class AntColonyOptimization {
   constructor(locations, params = {}) {
     this.alpha = params.alpha || 1;
     this.beta = params.beta || 2;
     this.rho = params.rho || 0.1;
     this.Q = params.Q || 1;
     this.antCount = params.antCount || 20;
     this.maxIterations = params.maxIterations || 100;
     this.locations = locations;
     this.n = locations.length;
     this.vehicleType = params.vehicleType || 'truck';
     
     this.distances = Array(this.n).fill().map(() => Array(this.n).fill(0));
     this.pheromones = Array(this.n).fill().map(() => Array(this.n).fill(0.1));
     
     this.calculateDistances();
   }
 
   calculateDistance(loc1, loc2) {
     const R = 6371;
     const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
     const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
     const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
               Math.sin(dLon/2) * Math.sin(dLon/2);
     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
     const distance = R * c;
 
     const vehicle = vehicleTypes[this.vehicleType];
     const useAlternativeRoute = Math.random() < 0.3;
     const speed = useAlternativeRoute ? vehicle.alternativeSpeed : vehicle.speed;
     const time = distance / speed;
 
     return { distance, time, isAlternative: useAlternativeRoute };
   }
 ///
   calculateDistances() {
     for (let i = 0; i < this.n; i++) {
       for (let j = 0; j < this.n; j++) {
         if (i !== j) {
           this.distances[i][j] = this.calculateDistance(
             this.locations[i],
             this.locations[j]
           );
         }
       }
     }
   }
 
   selectNextNode(ant, currentNode, unvisited, capacity, timeLimit, currentTime) {
     const probabilities = [];
     let totalProbability = 0;
 
     for (const nextNode of unvisited) {
       if (this.locations[nextNode].demand <= capacity) {
         const routeInfo = this.distances[currentNode][nextNode];
         const newTime = currentTime + routeInfo.time;
 
         if (newTime <= timeLimit) {
           const pheromone = Math.pow(this.pheromones[currentNode][nextNode], this.alpha);
           const distance = Math.pow(1 / routeInfo.distance, this.beta);
           const probability = pheromone * distance;
           probabilities.push({ node: nextNode, probability });
           totalProbability += probability;
         }
       }
     }
 
     if (totalProbability > 0) {
       let random = Math.random() * totalProbability;
       let sum = 0;
       for (const { node, probability } of probabilities) {
         sum += probability;
         if (random <= sum) return node;
       }
     }
     
     return unvisited[0];
   }
   ///
   findSpecificRoute(startIndex, endIndex, capacity, timeLimit) {
     let bestRoute = null;
     let bestMetrics = {
       distance: Infinity,
       time: Infinity,
       alternativeRoutes: 0
     };
     let bestDetails = null;
 
     // Try direct route
     const directRoute = [startIndex, endIndex];
     const directDetails = {
       distances: [this.distances[startIndex][endIndex].distance],
       times: [this.distances[startIndex][endIndex].time],
       isAlternative: [this.distances[startIndex][endIndex].isAlternative]
     };
     const directMetrics = calculateTotalMetrics(directRoute, directDetails, this.vehicleType);
 
     bestRoute = directRoute;
     bestMetrics = directMetrics;
     bestDetails = directDetails;
 
     // Try routes with stops
     for (let iteration = 0; iteration < this.maxIterations; iteration++) {
       const result = this.constructSolution(capacity, timeLimit, startIndex, endIndex);
       const metrics = calculateTotalMetrics(result.route, result.details, this.vehicleType);
 
       if (metrics.distance < bestMetrics.distance) {
         bestRoute = result.route;
         bestMetrics = metrics;
         bestDetails = result.details;
       }
     }
 
     return { route: bestRoute, metrics: bestMetrics, details: bestDetails };
   }
 
   constructSolution(capacity, timeLimit, startNode = 0, endNode = 0) {
     const route = [startNode];
     const details = {
       distances: [],
       times: [],
       isAlternative: []
     };
     
     let currentNode = startNode;
     let currentCapacity = capacity;
     let currentTime = 0;
     const unvisited = Array.from({ length: this.n }, (_, i) => i)
       .filter(i => i !== startNode && i !== endNode);
 
     while (unvisited.length > 0) {
       const nextNode = this.selectNextNode(
         route,
         currentNode,
         unvisited,
         currentCapacity,
         timeLimit,
         currentTime
       );
 
       if (!nextNode) break;
 
       const routeInfo = this.distances[currentNode][nextNode];
       currentTime += routeInfo.time;
       
       if (currentTime > timeLimit) break;
 
       route.push(nextNode);
       details.distances.push(routeInfo.distance);
       details.times.push(routeInfo.time);
       details.isAlternative.push(routeInfo.isAlternative);
       
       currentNode = nextNode;
       currentCapacity -= this.locations[nextNode].demand;
       
       const index = unvisited.indexOf(nextNode);
       unvisited.splice(index, 1);
     }
 
     route.push(endNode);
     const finalLeg = this.distances[currentNode][endNode];
     details.distances.push(finalLeg.distance);
     details.times.push(finalLeg.time);
     details.isAlternative.push(finalLeg.isAlternative);
 
     return { route, details };
   }
 
   findBestRoute(capacity, timeLimit) {
     let bestRoute = null;
     let bestMetrics = {
       distance: Infinity,
       time: Infinity,
       alternativeRoutes: 0
     };
     let bestDetails = null;
 
     for (let iteration = 0; iteration < this.maxIterations; iteration++) {
       const result = this.constructSolution(capacity, timeLimit);
       const metrics = calculateTotalMetrics(result.route, result.details, this.vehicleType);
 
       if (metrics.distance < bestMetrics.distance) {
         bestRoute = result.route;
         bestMetrics = metrics;
         bestDetails = result.details;
       }
 
       this.updatePheromones(bestRoute, bestMetrics);
     }
 
     return { route: bestRoute, metrics: bestMetrics, details: bestDetails };
   }
 
   updatePheromones(route, metrics) {
     for (let i = 0; i < this.n; i++) {
       for (let j = 0; j < this.n; j++) {
         this.pheromones[i][j] *= (1 - this.rho);
       }
     }
 
     const pheromoneToAdd = this.Q / metrics.distance;
     for (let i = 0; i < route.length - 1; i++) {
       const from = route[i];
       const to = route[i + 1];
       this.pheromones[from][to] += pheromoneToAdd;
       this.pheromones[to][from] += pheromoneToAdd;
     }
   }
 }
 
 // Initialize map and UI
 let currentRouteLayer = null;
 const map = L.map("map").setView([locations[0].lat, locations[0].lon], 12);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
   attribution: '© OpenStreetMap contributors'
 }).addTo(map);
 
 // Add markers for all locations
 locations.forEach(loc => {
   L.marker([loc.lat, loc.lon])
     .addTo(map)
     .bindPopup(`
       <strong>${loc.name}</strong><br>
       Muatan: ${loc.demand} kg
     `);
 });
 
 // Populate location dropdowns
 const startLocationSelect = document.getElementById("start-location");
 const endLocationSelect = document.getElementById("end-location");
 
 locations.forEach((loc, index) => {
   const option = document.createElement("option");
   option.value = index;
   option.textContent = loc.name;
   startLocationSelect.appendChild(option.cloneNode(true));
   endLocationSelect.appendChild(option);
 });
 
 // Event handlers
 async function optimizeRoute() {
   const vehicleType = document.getElementById("vehicle-type").value;
   const capacity = parseInt(document.getElementById("capacity").value);
   const maxTime = parseInt(document.getElementById("max-time").value);
   const activeMenu = document.querySelector('.menu-button.active').dataset.menu;
 
   if (currentRouteLayer) {
     map.removeLayer(currentRouteLayer);
   }
 
   const aco = new AntColonyOptimization(locations, {
     vehicleType: vehicleType,
     alpha: 1,
     beta: 2,
     rho: 0.1,
     antCount: 20,
     maxIterations: 50
   });
 
   let result;
   if (activeMenu === 'specific-route') {
     const startIndex = parseInt(document.getElementById("start-location").value);
     const endIndex = parseInt(document.getElementById("end-location").value);
     result = aco.findSpecificRoute(startIndex, endIndex, capacity, maxTime);
   } else {
     result = aco.findBestRoute(capacity, maxTime);
   }
 
   const routeCoordinates = result.route.map(i => [locations[i].lon, locations[i].lat]);
   const routeData = await fetchRoute(routeCoordinates, result.details.isAlternative[0]);
   const bestRouteElement = document.getElementById("best-route");
   const routeNames = result.route.map(index => locations[index].name);
   bestRouteElement.textContent = routeNames.join(" → ");
 
   if (!routeData) return;
 
   currentRouteLayer = L.polyline(routeData.coordinates, { 
     color: result.details.isAlternative[0] ? "#FF4500" : "#4CAF50",
     weight: 5,
     opacity: 0.7
   }).addTo(map);
 
   map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] });
 
   updateRouteDisplay(result, vehicleType);
 }
 
 function updateRouteDisplay(result, vehicleType) {
   const vehicle = vehicleTypes[vehicleType];
   
   document.getElementById("selected-vehicle").textContent = 
  document.getElementById("vehicle-type").options[document.getElementById("vehicle-type").selectedIndex].text;
   document.getElementById("selected-capacity").textContent = `${vehicle.capacity} kg`;
   document.getElementById("total-distance").textContent = `${result.metrics.distance.toFixed(2)} km`;
   document.getElementById("total-time").textContent = `${result.metrics.time.toFixed(1)} jam`;
   document.getElementById("total-deliveries").textContent = result.route.length - 2;
   document.getElementById("fuel-consumption").textContent = 
     `${result.metrics.fuelConsumption.toFixed(2)} liter`;
   document.getElementById("alternative-routes").textContent = 
     `${result.metrics.alternativeRoutes} rute alternatif`;
   document.getElementById("best-route").textContent = 
     result.route.map(i => locations[i].name).join(" → ");
   
   document.querySelector(".vehicle-icon").textContent = vehicle.icon;
 }
 
 // Event handlers untuk menu selector
 const menuButtons = document.querySelectorAll('.menu-button');
 const routeForms = document.querySelectorAll('.route-selection');
 
 menuButtons.forEach(button => {
   button.addEventListener('click', () => {
     const menuType = button.dataset.menu;
     
     // Toggle active button
     menuButtons.forEach(btn => btn.classList.remove('active'));
     button.classList.add('active');
     
     // Toggle form visibility
     routeForms.forEach(form => {
       if (form.id === `${menuType}-form`) {
         form.classList.add('active');
       } else {
         form.classList.remove('active');
       }
     });
   });
 });
 
 // Event listeners for form controls
 document.getElementById("optimize-btn").addEventListener("click", optimizeRoute);
 document.getElementById("vehicle-type").addEventListener("change", function(e) {
   const vehicle = vehicleTypes[e.target.value];
   document.getElementById("capacity").value = vehicle.capacity;
 });