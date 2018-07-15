if (process.argv.length !== 4) {
	const errorMessage = "Provide path to a usd and uah accounts bank statements.";
	console.error(errorMessage)
	throw new Error(errorMessage);
}

const usdCsvFileName = process.argv[2];
const uahCsvFileName = process.argv[3];

const USD = 'USD';
const UAH = 'UAH';

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
			result.push( {sum: sum, date: date, currency: USD} );
		}     
    }
    return result;
}

const parseUahCsv = inputFileName => {
	
	const parseFee = description => {
		let fragment = "на сумму";
		let indexOfFeeStart = description.indexOf("на суму");
		let indexOfFeeEnd = description.indexOf("грн", indexOfFeeStart);
		return parseNumber(description.slice(indexOfFeeStart + fragment.length, indexOfFeeEnd));
	}

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
			if (description.indexOf("від продажу валюти") >=0
				&& description.indexOf("зг. заявки") === -1) {
				const date = parseDate(csvAsArray[i][dateIndex]);
				const feeAmount = parseFee(description);				

				result.push( {sumUah: sum + feeAmount, date: date, currency: UAH} );
			}	
		}     
    }
    return result;
}

const calculateUahByNbuRate = async usdSums => {
	const axios = require('axios');

	let usdIncomeByNbuRate = [...usdSums];
	
	for (let i = 0; i < usdIncomeByNbuRate.length; i++) {
		const formattedDate = formatDate(usdSums[i].date).replace(/-/g, '');		
		const nbuRepsonce = await axios(
			"https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json&valcode=USD&date="
			+ formattedDate);
		const rate = nbuRepsonce.data[0].rate;		
		usdIncomeByNbuRate[i].sumUah = rate * usdIncomeByNbuRate[i].sum;
		usdIncomeByNbuRate[i].rate = rate;
	}	
	
	return usdIncomeByNbuRate;
}

const sumUahTotal = (uahIncome, foreignCurrencyIncome) => {
	const formatSum = (sum, width, fixed) => {
		if (typeof sum !== 'number') {
			return new String('-').padStart(width, ' ');
		}

		if (typeof fixed !== 'undefined') {
			return new String(sum.toFixed(fixed)).padStart(width, ' ').substring(0, width);
		}

		return new String(sum).padStart(width, ' ').substring(0, width);
	}

	let allIncome = [...uahIncome, ...foreignCurrencyIncome];
	allIncome.sort((a, b) => a.date - b.date);
	let total = 0;
	console.log("date \t\t sum(uah) \t sum(usd) \t rate \t currency");
	for (let i = 0; i < allIncome.length; i++) {
		let {date, sumUah, sum, rate, currency} = allIncome[i];
		total += sumUah;
		console.log(`${formatDate(date)}  ${formatSum(sumUah, 14, 4)} ${formatSum(sum, 12, 2)} ${formatSum(rate, 14)} \t ${currency}`);
	}	
	
	return total;
}

let uahIncome = parseUahCsv(uahCsvFileName);

let usdSums = parseUsdCsv(usdCsvFileName);
let usdIncomeByNbuRate = calculateUahByNbuRate(usdSums);

usdIncomeByNbuRate.then(
	foreignCurrencyIncome => { 
		console.log(sumUahTotal(uahIncome, foreignCurrencyIncome));
	},
    error  => { console.log(error) }
)
