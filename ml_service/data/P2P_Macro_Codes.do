clear all
use "${path}\P2P_Macro_Data.dta", replace

*****Drop variables with all missing values****
foreach var of varlist _all {
    capture assert mi(`var')
	if !_rc {
    drop `var'
     }
}
gen issue_date=monthly(issue_d, "MY",2050)
format %tmMonth_CCYY issue_date
gen last_date=monthly(last_pymnt_d, "MY",2050)
format %tmMonth_CCYY last_date
replace last_date=issue_date if last_date==.
gen daily_date=dofm(last_date)
format daily_date %d
gen quarter=quarter(daily_date)
gen month=month(daily_date)
gen year=year(daily_date)
gen issue_daily=dofm(issue_date)
format issue_daily %d
gen issue_year=year(issue_daily)

****work with variables: create rank variables, destring***
gen des_length=strlen(desc)
local listofranks  application_type initial_list_status purpose pymnt_plan verification_status home_ownership emp_length grade sub_grade term
	foreach x of local listofranks {
	encode `x', generate(`x'_)
}
destring revol_util int_rate, replace percent
gen loan_status_=loan_status
replace loan_status_="Fully Paid" if loan_status=="Does not meet the credit policy. Status:Fully Paid"
replace loan_status_="Charged Off" if loan_status=="Does not meet the credit policy. Status:Charged Off"
gen badloan=1 if loan_status=="Charged Off" | loan_status=="Default" | loan_status=="Does not meet the credit policy. Status:Charged Off" | ///
	loan_status=="Late (16-30 days)" | loan_status=="Late (31-120 days)"
replace badloan=0 if badloan==.
encode loan_status_, gen(rankloan_status_)
encode addr_state, gen(state)

*** create log of variables
local listoflogs funded_amnt annual_inc dti total_acc mo_sin_old_il_acct mo_sin_rcnt_tl num_accts_ever_120_pd pct_tl_nvr_dlq ///
	percent_bc_gt_75 tot_hi_cred_lim earnings employment labor_force financeuser socialnetworkuser internetuser ///
	empl_expan empl_birth new_bus popestimate unemployment gdppercap
foreach x of local listoflogs {
	gen log`x'=log(`x')
}
********************************************************************
****************SUMMARY STATISTICS ********************************************
*Summary statistics
tab issue_year if baselinesample==1
tab state if baselinesample==1
egen loan_sum=sum(loan_amnt) if baselinesample==1
summarize badloan inf muni_points logfunded_amnt  int_rate inq_last_6mths open_acc logtotal_acc pub_rec  des_length  logpct_tl_nvr_dlq logtot_hi_cred_lim ///
		i.grade_ i.term_ i.pymnt_plan_ i.purpose_ i.application_type_ i.initial_list_status_ ///
		logannual_inc  logdti delinq_2yrs pub_rec_bankruptcies tax_liens i.emp_length_ i.home_ownership_ i.verification_status_ ///
		logearnings logunemployment loglabor_force  logempl_birth lognew_bus gdpcontrib ///
		loginternetuser rep religiousity
est sto summary_stat
esttab summary_stat using Summarystat1.rtf, cells("count mean sd p25 P75")
*CORRELATION MATRIX
estpost correlate badloan inf muni_points logfunded_amnt  int_rate inq_last_6mths open_acc logtotal_acc pub_rec  des_length  logpct_tl_nvr_dlq logtot_hi_cred_lim ///
		grade_ term_ pymnt_plan_ purpose_ application_type_ initial_list_status_ ///
		logannual_inc  logdti delinq_2yrs pub_rec_bankruptcies tax_liens emp_length_ home_ownership_ verification_status_ ///
		logearnings logunemployment loglabor_force  lognew_bus gdpcontrib ///
		loginternetuser rep religiousity, matrix
esttab . using correlation.rtf, not unstack compress noobs b(4)

****** Create LAGS**** 
local listoflags muni_6m inf_6m
foreach x of local listoflags {
	replace `x'=`x'[_n-6]
}
**** Loan volumes****
bysort state issue_date: egen loan_vol6m=sum(loan_amnt)
gen loglvol_6m=log(loan_vol6m)
bysort state last_date: egen loan_vol=sum(loan_amnt)
egen loanmedian=median(loan_vol)
egen loan6m_median=median(loan_vol6m)
gen median_dummy=1 if loan_vol>loanmedian
replace median_dummy=0 if median_dummy==.
