import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { ViewPropTypes } from 'react-native';
import Button from 'react-native-button';
import getStyles from './styledButtonStyles';

/**
 * UI component that renders a styled button
 * for iOS devices
 * see styledButtonStyles.js for available styles
 */
export default class StyledButton extends Component {
	static propTypes = {
		/**
		 * Children components of the Button
		 * it can be a text node, an image, or an icon
		 * or an Array with a combination of them
		 */
		children: PropTypes.any,
		/**
		 * Type of the button
		 */
		disabled: PropTypes.bool,
		/**
		 * Styles to be applied to the Button Text
		 */
		style: ViewPropTypes.style,
		/**
		 * Styles to be applied to the Button disabled state text
		 */
		styleDisabled: ViewPropTypes.style,
		/**
		 * Styles to be applied to the Button disabled container
		 */
		disabledContainerStyle: ViewPropTypes.style,
		/**
		 * Styles to be applied to the Button Container
		 */
		containerStyle: ViewPropTypes.style,
		/**
		 * Function to be called on press
		 */
		onPress: PropTypes.func,
		/**
		 * Type of the button
		 */
		type: PropTypes.string,
		/**
		 * ID of the element to be used on e2e tests
		 */
		testID: PropTypes.string
	};

	static defaultProps = {
		...Component.defaultProps,
		styleDisabled: { opacity: 0.6 },
		disabledContainerStyle: { opacity: 0.6 }
	};

	render = () => {
		const { type, onPress, style, children, disabled, styleDisabled, testID, disabledContainerStyle } = this.props;
		const { fontStyle, containerStyle } = getStyles(type);

		return (
			<Button
				testID={testID}
				disabled={disabled}
				styleDisabled={styleDisabled}
				disabledContainerStyle={disabledContainerStyle}
				onPress={onPress}
				style={[fontStyle, style]}
				containerStyle={[containerStyle, this.props.containerStyle]}
			>
				{children}
			</Button>
		);
	};
}