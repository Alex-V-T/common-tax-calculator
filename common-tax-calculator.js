if (process.argv.length !== 4) {
	const errorMessage = "Provide path to a source CSV as a single argument.";
	console.error(errorMessage)
	throw new Error(errorMessage);
}

const usdCsvFileName = process.argv[2];
const uahCsvFileName = process.argv[3];

const parseNumber = stringValue => {
	return Number(stringValue.replace(' ', ''));
}

const parseDate = stringValue => {
	const pattern = /(\d{2})\.(\d{2})\.(\d{4})/;
	return new Date(stringValue.replace(pattern,'$3-$2-$1'));
}

const formatDate = date => date.toISOString().slice(0,10);

const parseCsvToArray = inputFilePath => {
	const fs = require('fs');
	const csvParser = require('papaparse');

	const inputFile = fs.readFileSync(inputFilePath, { encoding: 'utf8' });
	
	// parse csv skippng blank lines
	return csvParser.parse(inputFile, { skipEmptyLines: true, encoding: 'utf8' }).data;
}

const parseUsdCsv = inputFileName => {
	const dateIndex = 4;	    
	const creditIndex = 14;
	const result = [];
	const csvAsArray = parseCsvToArray(inputFileName);
	
    // iterate from 2nd line to skip the header
    for (let i = 1; i < csvAsArray.length; i++) {
		const sum = parseNumber(csvAsArray[i][creditIndex]);
		if (sum > 0) {
			const date = parseDate(csvAsArray[i][dateIndex]);
			result.push( {sum: sum, date: date} );
		}     
    }
    return result;
}

const parseUahCsv = inputFileName => {
	const dateIndex = 4;
	const creditIndex = 14;
	const descriptionIndex = 15;
	const result = [];
	const csvAsArray = parseCsvToArray(inputFileName);
	
    // iterate from 2nd line to skip the header
    for (let i = 1; i < csvAsArray.length; i++) {		
		const sum = parseNumber(csvAsArray[i][creditIndex]);
		let description = csvAsArray[i][descriptionIndex];

		if (sum > 0) {
			const date = parseDate(csvAsArray[i][dateIndex]);
			result.push({
				sum: sum, 
				date: date, 
				description: description
			});			
		}     
    }
    return result;
}


const sumByNbuRate = async usdSums => {
	const axios = require('axios');

	let total = 0;
	
	console.debug("date \t\t sum(usd) \t rate");
	for (let i = 0; i < usdSums.length; i++) {
		const formattedDate = formatDate(usdSums[i].date).replace(/-/g, '');		
		const nbuRepsonce = await axios(
			"https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json&valcode=USD&date="
			+ formattedDate);
		const rate = nbuRepsonce.data[0].rate;
		
		console.debug(`${formatDate(usdSums[i].date)}  \t ${usdSums[i].sum} \t ${rate} \t ${rate * usdSums[i].sum}`);
		
		total += rate * usdSums[i].sum;
	}	
	
	return total;
}

const sumMandatorySale = uahSums => {

	const parseFee = description => {
		let fragment = "на сумму";
		let indexOfFeeStart = description.indexOf("на суму");
		let indexOfFeeEnd = description.indexOf("грн", indexOfFeeStart);
		return parseNumber(description.slice(indexOfFeeStart + fragment.length, indexOfFeeEnd));
	}

	let total = 0;
	
	console.debug("date \t sum(uah) \t\t description");
	for (let i = 0; i < uahSums.length; i++) {
		
		if (uahSums[i].description.indexOf("від продажу валюти") >=0
			&& uahSums[i].description.indexOf("зг. заявки") === -1) {
			const feeAmount = parseFee(uahSums[i].description);				
			console.debug(`${formatDate(uahSums[i].date)} \t ${uahSums[i].sum + feeAmount} \t ${uahSums[i].description}`);

			total += uahSums[i].sum + feeAmount;
		}				
	}	
	
	return total;
}

let uahSums = parseUahCsv(uahCsvFileName);
let mandatorySellTotal = sumMandatorySale(uahSums);

let usdSums = parseUsdCsv(usdCsvFileName);
let totalUah = sumByNbuRate(usdSums);

totalUah.then(
	result => { console.log('Total sum: ' + (result + mandatorySellTotal)) },
    error  => { console.log(error) }
)
