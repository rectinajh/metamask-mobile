import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { connect } from 'react-redux';
import IonicIcon from 'react-native-vector-icons/Ionicons';
import AntIcon from 'react-native-vector-icons/AntDesign';
import FeatherIcon from 'react-native-vector-icons/Feather';
import FAIcon from 'react-native-vector-icons/FontAwesome';
import FA5Icon from 'react-native-vector-icons/FontAwesome5';
import { toChecksumAddress } from 'ethereumjs-util';
import { NavigationContext } from 'react-navigation';
import { swapsUtils } from '@estebanmino/controllers';

import Engine from '../../../core/Engine';
import AppConstants from '../../../core/AppConstants';
import { convertApiValueToGWEI } from '../../../util/custom-gas';
import Device from '../../../util/Device';
import { colors } from '../../../styles/common';
import { renderFromTokenMinimalUnit, renderFromWei, toBN, toWei, weiToFiat } from '../../../util/number';
import { getErrorMessage, getFetchParams, getQuotesNavigationsParams, useRatio } from './utils';
import useGasPrice from './utils/useGasPrice';

import { getSwapsQuotesNavbar } from '../Navbar';
import Text from '../../Base/Text';
import Title from '../../Base/Title';
import useModalHandler from '../../Base/hooks/useModalHandler';
import ScreenView from '../FiatOrders/components/ScreenView';
import StyledButton from '../StyledButton';
import TokenIcon from './components/TokenIcon';
import QuotesSummary from './components/QuotesSummary';
import FeeModal from './components/FeeModal';
import QuotesModal from './components/QuotesModal';
import { strings } from '../../../../locales/i18n';

const POLLING_INTERVAL = AppConstants.SWAPS.POLLING_INTERVAL;

const styles = StyleSheet.create({
	screen: {
		flexGrow: 1,
		justifyContent: 'space-between'
	},
	topBar: {
		alignItems: 'center'
	},
	timerWrapper: {
		backgroundColor: colors.grey000,
		borderRadius: 20,
		marginVertical: 15,
		paddingVertical: 4,
		paddingHorizontal: 15,
		flexDirection: 'row',
		alignItems: 'center'
	},
	timer: {
		fontVariant: ['tabular-nums']
	},
	timerHiglight: {
		color: colors.red
	},
	content: {
		paddingHorizontal: 20,
		alignItems: 'center'
	},
	errorViewContent: {
		flex: 1,
		paddingHorizontal: 40,
		justifyContent: 'center'
	},
	sourceTokenContainer: {
		flexDirection: 'row',
		alignItems: 'center'
	},
	tokenIcon: {
		marginHorizontal: 5
	},
	arrowDown: {
		color: colors.grey100,
		fontSize: Device.isSmallDevice() ? 22 : 25,
		marginHorizontal: 15,
		marginTop: 4,
		marginBottom: 2
	},
	amount: {
		textAlignVertical: 'center',
		fontSize: Device.isSmallDevice() ? 45 : 60
	},
	exchangeRate: {
		flexDirection: 'row',
		alignItems: 'center',
		marginVertical: Device.isSmallDevice() ? 1 : 1
	},
	bottomSection: {
		marginBottom: 10,
		alignItems: 'stretch',
		paddingHorizontal: 20
	},
	quotesSummary: {
		marginVertical: Device.isSmallDevice() ? 15 : 30
	},
	quotesSummaryHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		flexWrap: 'wrap'
	},
	quotesRow: {
		flexDirection: 'row'
	},
	quotesDescription: {
		flex: 1,
		flexWrap: 'wrap',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginRight: 6
	},
	quotesLegend: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		marginRight: 2
	},
	linkText: {
		color: colors.blue
	},
	quotesFiatColumn: {
		alignItems: 'flex-end',
		justifyContent: 'center'
	},
	infoIcon: {
		fontSize: 12,
		margin: 3,
		color: colors.blue
	},
	ctaButton: {
		width: '100%'
	},
	errorIcon: {
		fontSize: 44,
		marginVertical: 4,
		color: colors.red
	},
	expiredIcon: {
		color: colors.blue
	}
});

async function resetAndStartPolling({ slippage, sourceToken, destinationToken, sourceAmount, fromAddress }) {
	const { SwapsController, TokenRatesController } = Engine.context;
	const destinationTokenConversionRate =
		TokenRatesController.state.contractExchangeRates[toChecksumAddress(destinationToken.address)] || 0;
	// TODO: destinationToken could be the 0 address for ETH, also tokens that aren't on the wallet
	const fetchParams = getFetchParams({
		slippage,
		sourceToken,
		destinationToken,
		sourceAmount,
		fromAddress,
		destinationTokenConversionRate
	});
	await SwapsController.stopPollingAndResetState();
	await SwapsController.startFetchAndSetQuotes(fetchParams, fetchParams.metaData);
}

function SwapsQuotesView({
	tokens,
	selectedAddress,
	currentCurrency,
	conversionRate,
	isInPolling,
	isInFetch,
	quotesLastFetched,
	pollingCyclesLeft,
	topAggId,
	quotes,
	errorKey
}) {
	const navigation = useContext(NavigationContext);
	const [gasPrice] = useGasPrice();

	/* Get params from navigation */
	const { sourceTokenAddress, destinationTokenAddress, sourceAmount, slippage } = useMemo(
		() => getQuotesNavigationsParams(navigation),
		[navigation]
	);

	/* Get tokens from the tokens list */
	const sourceToken = tokens?.find(token => token.address?.toLowerCase() === sourceTokenAddress.toLowerCase());
	const destinationToken = tokens?.find(
		token => token.address?.toLowerCase() === destinationTokenAddress.toLowerCase()
	);

	/* State */
	const [firstLoadTime, setFirstLoadTime] = useState(Date.now());
	const [isFirstLoad, setFirstLoad] = useState(true);
	const [remainingTime, setRemainingTime] = useState(POLLING_INTERVAL);

	/* Selected quote, initially topAggId (see effects) */
	const [selectedQuoteId, setSelectedQuoteId] = useState(null);

	/* Get quotes as an array with gasPrices */
	const allQuotes = useMemo(() => {
		if (!quotes || Object.keys(quotes).length === 0) {
			return [];
		}

		const multiplyGasByGasPrice = quote => ({
			...quote,
			estimatedNetworkFee: toBN(quote.estimatedNetworkFee).mul(
				toWei(convertApiValueToGWEI(gasPrice?.average || 0), 'gwei')
			),
			maxNetworkFee: toBN(quote.maxNetworkFee).mul(toWei(convertApiValueToGWEI(gasPrice?.average || 0), 'gwei'))
		});

		return Object.values(quotes)
			.sort((a, b) => a.estimatedNetworkFee - b.estimatedNetworkFee)
			.map(quote => multiplyGasByGasPrice(quote));
	}, [gasPrice, quotes]);

	/* Get the selected quote, by default is topAggId */
	const selectedQuote = useMemo(() => allQuotes.find(quote => quote.aggregator === selectedQuoteId), [
		allQuotes,
		selectedQuoteId
	]);

	// TODO: use this variable in the future when calculating savings
	const [isSaving] = useState(false);

	/* Get the ratio between the assets given the selected quote*/
	const [ratioAsSource, setRatioAsSource] = useState(true);

	const [numerator, denominator] = useMemo(() => {
		const source = { ...sourceToken, amount: selectedQuote?.sourceAmount };
		const destination = { ...destinationToken, amount: selectedQuote?.destinationAmount };

		return ratioAsSource ? [destination, source] : [source, destination];
	}, [destinationToken, ratioAsSource, selectedQuote, sourceToken]);

	const ratio = useRatio(numerator?.amount, numerator?.decimals, denominator?.amount, denominator?.decimals);

	/* Modals, state and handlers */
	const [isFeeModalVisible, toggleFeeModal, , hideFeeModal] = useModalHandler(false);
	const [isQuotesModalVisible, toggleQuotesModal, , hideQuotesModal] = useModalHandler(false);

	/* Handlers */
	const handleRatioSwitch = () => setRatioAsSource(isSource => !isSource);

	const handleRetryFetchQuotes = useCallback(() => {
		if (errorKey === swapsUtils.SwapsError.QUOTES_EXPIRED_ERROR) {
			setFirstLoadTime(Date.now());
			setFirstLoad(true);
			resetAndStartPolling({
				slippage,
				sourceToken,
				destinationToken,
				sourceAmount,
				fromAddress: selectedAddress
			});
		} else {
			navigation.pop();
		}
	}, [errorKey, slippage, sourceToken, destinationToken, sourceAmount, selectedAddress, navigation]);

	/* Effects */

	/* Main polling effect */
	useEffect(() => {
		resetAndStartPolling({
			slippage,
			sourceToken,
			destinationToken,
			sourceAmount,
			fromAddress: selectedAddress
		});
		return () => {
			const { SwapsController } = Engine.context;
			SwapsController.stopPollingAndResetState();
		};
	}, [destinationToken, selectedAddress, slippage, sourceAmount, sourceToken]);

	/* First load effect: handle initial animation */
	useEffect(() => {
		if (isFirstLoad) {
			if (firstLoadTime < quotesLastFetched || errorKey) {
				setFirstLoad(false);
			}
		}
	}, [errorKey, firstLoadTime, isFirstLoad, quotesLastFetched]);

	/* selectedQuoteId effect: when topAggId changes make it selected by default */
	useEffect(() => setSelectedQuoteId(topAggId), [topAggId]);

	/* IsInFetch effect: hide every modal, handle countdown */
	useEffect(() => {
		if (isInFetch) {
			setRemainingTime(POLLING_INTERVAL);
			hideFeeModal();
			hideQuotesModal();
			return;
		}
		const tick = setInterval(() => {
			setRemainingTime(quotesLastFetched + POLLING_INTERVAL - Date.now() + 1000);
		}, 1000);
		return () => {
			clearInterval(tick);
		};
	}, [hideFeeModal, hideQuotesModal, isInFetch, quotesLastFetched]);

	/* errorKey effect: hide every modal*/
	useEffect(() => {
		if (errorKey) {
			hideFeeModal();
			hideQuotesModal();
		}
	}, [errorKey, hideFeeModal, hideQuotesModal]);

	/* Rendering */
	if (isFirstLoad || (!errorKey && !selectedQuote)) {
		return (
			<ScreenView contentContainerStyle={styles.screen}>
				<View style={[styles.content, styles.errorViewContent]}>
					<ActivityIndicator size="large" />
				</View>
			</ScreenView>
		);
	}

	if (!isInPolling && errorKey) {
		const [errorTitle, errorMessage, errorAction] = getErrorMessage(errorKey);
		const errorIcon =
			errorKey === swapsUtils.SwapsError.QUOTES_EXPIRED_ERROR ? (
				<FeatherIcon name="clock" style={[styles.errorIcon, styles.expiredIcon]} />
			) : (
				<AntIcon name="warning" style={[styles.errorIcon]} />
			);

		return (
			<ScreenView contentContainerStyle={styles.screen}>
				<View style={[styles.content, styles.errorViewContent]}>
					{errorIcon}
					<Title centered>{errorTitle}</Title>
					<Text centered>{errorMessage}</Text>
				</View>
				<View style={styles.bottomSection}>
					<StyledButton type="blue" containerStyle={styles.ctaButton} onPress={handleRetryFetchQuotes}>
						{errorAction}
					</StyledButton>
				</View>
			</ScreenView>
		);
	}

	return (
		<ScreenView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
			<View style={styles.topBar}>
				{isInPolling && (
					<View style={styles.timerWrapper}>
						{isInFetch ? (
							<>
								<ActivityIndicator size="small" />
								<Text> {strings('swaps.fetching_new_quotes')}</Text>
							</>
						) : (
							<Text primary>
								{pollingCyclesLeft > 0
									? strings('swaps.new_quotes_in')
									: strings('swaps.quotes_expire_in')}{' '}
								<Text
									bold
									primary
									style={[styles.timer, remainingTime < 30000 && styles.timerHiglight]}
								>
									{new Date(remainingTime).toISOString().substr(15, 4)}
								</Text>
							</Text>
						)}
					</View>
				)}
				{!isInPolling && (
					<View style={styles.timerWrapper}>
						<Text>...</Text>
					</View>
				)}
			</View>

			<View style={styles.content}>
				{selectedQuote && (
					<>
						<View style={styles.sourceTokenContainer}>
							<Text>{renderFromTokenMinimalUnit(selectedQuote.sourceAmount, sourceToken.decimals)}</Text>
							<TokenIcon
								style={styles.tokenIcon}
								icon={sourceToken.iconUrl}
								symbol={sourceToken.symbol}
							/>
							<Text>{sourceToken.symbol}</Text>
						</View>
						<IonicIcon style={styles.arrowDown} name="md-arrow-down" />
						<View style={styles.sourceTokenContainer}>
							<TokenIcon
								style={styles.tokenIcon}
								icon={destinationToken.iconUrl}
								symbol={destinationToken.symbol}
							/>
							<Text>{destinationToken.symbol}</Text>
						</View>
						<Text primary style={styles.amount} numberOfLines={1} adjustsFontSizeToFit allowFontScaling>
							~{renderFromTokenMinimalUnit(selectedQuote.destinationAmount, destinationToken.decimals)}
						</Text>
						<View style={styles.exchangeRate}>
							<Text>
								1 {denominator?.symbol} = {ratio.toFormat(10)} {numerator?.symbol}{' '}
								<FA5Icon name="sync" style={styles.infoIcon} onPress={handleRatioSwitch} />
							</Text>
						</View>
					</>
				)}
			</View>

			<View style={styles.bottomSection}>
				{selectedQuote && (
					<QuotesSummary style={styles.quotesSummary}>
						<QuotesSummary.Header style={styles.quotesSummaryHeader} savings={isSaving}>
							<QuotesSummary.HeaderText bold>
								{isSaving ? strings('swaps.savings') : strings('swaps.using_best_quote')}
							</QuotesSummary.HeaderText>
							<TouchableOpacity onPress={toggleQuotesModal}>
								<QuotesSummary.HeaderText small>
									{strings('swaps.view_details')} →
								</QuotesSummary.HeaderText>
							</TouchableOpacity>
						</QuotesSummary.Header>
						<QuotesSummary.Body>
							<View style={styles.quotesRow}>
								<View style={styles.quotesDescription}>
									<View style={styles.quotesLegend}>
										<Text primary bold>
											{strings('swaps.estimated_gas_fee')}
										</Text>
									</View>
									<Text primary bold>
										{renderFromWei(selectedQuote.estimatedNetworkFee)} ETH
									</Text>
								</View>
								<View style={styles.quotesFiatColumn}>
									<Text primary bold>
										{weiToFiat(selectedQuote.estimatedNetworkFee, conversionRate, currentCurrency)}
									</Text>
								</View>
							</View>

							<View style={styles.quotesRow}>
								<View style={styles.quotesDescription}>
									<View style={styles.quotesLegend}>
										<Text>{strings('swaps.max_gas_fee')} </Text>
										<TouchableOpacity>
											<Text style={styles.linkText}>{strings('swaps.edit')}</Text>
										</TouchableOpacity>
									</View>
									<Text>{renderFromWei(selectedQuote.maxNetworkFee)} ETH</Text>
								</View>
								<View style={styles.quotesFiatColumn}>
									<Text>
										{weiToFiat(selectedQuote.maxNetworkFee, conversionRate, currentCurrency)}
									</Text>
								</View>
							</View>

							<QuotesSummary.Separator />
							<View style={styles.quotesRow}>
								<TouchableOpacity style={styles.quotesRow} onPress={toggleFeeModal}>
									<Text small>
										{strings('swaps.quotes_include_fee', { fee: '0.875%' })}{' '}
										<FAIcon name="info-circle" style={styles.infoIcon} />
									</Text>
								</TouchableOpacity>
							</View>
						</QuotesSummary.Body>
					</QuotesSummary>
				)}
				<StyledButton
					type="blue"
					containerStyle={styles.ctaButton}
					disabled={!isInPolling || isInFetch || !selectedQuote}
				>
					{strings('swaps.tap_to_swap')}
				</StyledButton>
			</View>

			<FeeModal isVisible={isFeeModalVisible} toggleModal={toggleFeeModal} />
			<QuotesModal
				isVisible={isQuotesModalVisible}
				toggleModal={toggleQuotesModal}
				quotes={allQuotes}
				destinationToken={destinationToken}
				selectedQuote={selectedQuoteId}
			/>
		</ScreenView>
	);
}

SwapsQuotesView.propTypes = {
	tokens: PropTypes.arrayOf(PropTypes.object),
	/**
	 * Map of accounts to information objects including balances
	 */
	// accounts: PropTypes.object,
	/**
	 * ETH to current currency conversion rate
	 */
	conversionRate: PropTypes.number,
	/**
	 * Currency code of the currently-active currency
	 */
	currentCurrency: PropTypes.string,
	/**
	 * A string that represents the selected address
	 */
	selectedAddress: PropTypes.string,
	isInPolling: PropTypes.bool,
	isInFetch: PropTypes.bool,
	quotesLastFetched: PropTypes.number,
	topAggId: PropTypes.string,
	pollingCyclesLeft: PropTypes.number,
	quotes: PropTypes.object,
	errorKey: PropTypes.string
};

SwapsQuotesView.navigationOptions = ({ navigation }) => getSwapsQuotesNavbar(navigation);

const mapStateToProps = state => ({
	// accounts: state.engine.backgroundState.AccountTrackerController.accounts,
	selectedAddress: state.engine.backgroundState.PreferencesController.selectedAddress,
	conversionRate: state.engine.backgroundState.CurrencyRateController.conversionRate,
	currentCurrency: state.engine.backgroundState.CurrencyRateController.currentCurrency,
	tokens: state.engine.backgroundState.SwapsController.tokens,
	isInPolling: state.engine.backgroundState.SwapsController.isInPolling,
	isInFetch: state.engine.backgroundState.SwapsController.isInFetch,
	quotesLastFetched: state.engine.backgroundState.SwapsController.quotesLastFetched,
	pollingCyclesLeft: state.engine.backgroundState.SwapsController.pollingCyclesLeft,
	topAggId: state.engine.backgroundState.SwapsController.topAggId,
	quotes: state.engine.backgroundState.SwapsController.quotes,
	approvalTransaction: state.engine.backgroundState.SwapsController.approvalTransaction,
	errorKey: state.engine.backgroundState.SwapsController.errorKey
});

export default connect(mapStateToProps)(SwapsQuotesView);