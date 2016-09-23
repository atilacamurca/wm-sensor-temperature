const five = require("johnny-five");
const rp = require('request-promise');
const url = 'http://localhost:8000';
const auth = {
    method: 'POST',
    uri: url + '/api/authenticate',
    body: {
        api_key: '',
        monitor_key: ''
    },
    json: true
};
const RATE_LIMIT = 20;
const MIN_MEASURES = 50;

class Monitor {
    constructor(token) {
        this.token = token;
        this.med = [];
        this.rate = 1;
    }

    getApiOptions() {
        return {
            method: 'POST',
            uri: url + '/api/send',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: {
                data: null
            },
            json: true
        };
    }

    getRefreshOptions() {
        return {
            method: 'GET',
            uri: url + '/api/refresh-token',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            json: true
        };
    }

    pushValue(value) {
        this.med.push(value);
    }

    send() {
        let len = this.med.length;
        if (len < MIN_MEASURES) {
            return;
        }
        let result = this.calcMed();
        console.log('result:', result);
        let apiOptions = this.getApiOptions();
        apiOptions.body.data = JSON.stringify({value: result});
        this.med = [];
        rp(apiOptions)
            .then((json) => {
                console.log('rate:', this.rate, 'response:', json);
                this.rate++;
                if (this.rate > RATE_LIMIT) {
                    console.log('time to update the token');
                    this.refreshToken();
                }
            })
            .catch((err) => {
                console.log(err);
            });
    }

    refreshToken() {
        rp(this.getRefreshOptions())
            .then((json) => {
                this.token = json.token;
                console.log('token refreshed:', this.token);
                this.rate = 0; // reset rate
            })
            .catch((err) => {
                console.log(err);
            });
    }

    calcMed() {
        let result = 0;
        for (let value of this.med) {
            result += value;
        }
        return result / this.med.length;
    }
}

rp(auth)
    .then(function(result) {
        var token = result.token;
        console.log('token received:', token);
        var monitor = new Monitor(token);

        five.Board().on('ready', function() {
            var temperature = new five.Thermometer({
                controller: 'LM35',
                pin: 'A0'
            });

            temperature.on('change', function() {
                monitor.pushValue(parseFloat(this.celsius));
                monitor.send();
            });
        });
    })
    .catch(function(err) {
        console.log(err);
    });
