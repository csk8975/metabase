import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import Popover from "metabase/components/Popover.jsx";

import { parseExpressionString, tokenAtPosition, tokensToExpression } from "metabase/lib/expressions";


const VALID_OPERATORS = new Set(['+', '-', '*', '/']);

const KEYCODE_TAB   =  9;
const KEYCODE_ENTER = 13;
const KEYCODE_UP    = 38;
const KEYCODE_DOWN  = 40;


// return the first token with a non-empty error message
function getErrorToken(tokens) {
    for (var i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.error && token.error.length) return token;
        if (!token.isParent) continue;
        let childError = getErrorToken(token.value);
        if (childError) return childError;
    }
}


export default class ExpressionEditorTextfield extends Component {
    constructor(props, context) {
        super(props, context);
        _.bindAll(this, 'onInputChange', 'onInputKeyDown', 'onInputBlur', 'onSuggestionAccepted', 'onSuggestionMouseDown');
    }

    static propTypes = {
        expression: PropTypes.array,      // should be an array like [parsedExpressionObj, expressionString]
        tableMetadata: PropTypes.object.isRequired,
        onSetExpression: PropTypes.func.isRequired
    };

    static defaultProps = {
        expression: [null, ""],
        placeholder: "= write some math!"
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        // we only refresh our state if we had no previous state OR if our expression or table has changed
        if (!this.state || this.props.expression != newProps.expression || this.props.tableMetadata != newProps.tableMetadata) {
            let parsedExpression = newProps.expression[0],
                expression       = newProps.expression[1],
                tokens           = [];

            let errorMessage = null;
            try {
                tokens = expression && expression.length ? tokensToExpression(parseExpressionString(expression, newProps.tableMetadata.fields, VALID_OPERATORS)) : [];
            } catch (e) {
                errorMessage = e;
            }

            this.setState({
                parsedExpression:       parsedExpression,
                expressionString:       expression,
                tokens:                 tokens,
                expressionErrorMessage: errorMessage,
                suggestions:            [],
                highlightedSuggestion:  0,
                suggestionsTitle:       null
            });
        }
    }

    onSuggestionAccepted() {
        let inputElement = document.getElementById('react_qb_expression_input'),
            displayName  = this.state.suggestions[this.state.highlightedSuggestion].display_name,
            // wrap field names with spaces in them in quotes
            needsQuotes  = displayName.indexOf(' ') > -1,
            suggestion   = needsQuotes ? ('"' + displayName + '"') : displayName,
            tokenAtPoint = tokenAtPosition(this.state.tokens, inputElement.selectionStart);

        console.log('replacing:', tokenAtPoint, 'with:', suggestion);

        let expression = this.state.expressionString.substring(0, tokenAtPoint.start) + suggestion + this.state.expressionString.substring(tokenAtPoint.end, this.state.expressionString.length);

        // Remove extra quotation marks in case we accidentally inserted duplicates when accepting a suggestion already inside some
        expression = expression.replace(/"+/, '"');

        // hand off to the code that deals with text change events which will trigger parsing and new autocomplete suggestions
        inputElement.value = expression + ' ';
        this.onInputChange(); // add a blank space after end of token

        this.setState({
            highlightedSuggestion: 0
        });
    }

    onSuggestionMouseDown(event) {
        // when a suggestion is clicked, we'll highlight the clicked suggestion and then hand off to the same code that deals with ENTER / TAB keydowns
        event.preventDefault();

        this.setState({
            highlightedSuggestion: parseInt(event.target.getAttribute('data-i'))
        }, this.onSuggestionAccepted);
    }

    onInputKeyDown(event) {
        if (!this.state.suggestions.length) return;

        if (event.keyCode === KEYCODE_ENTER || event.keyCode === KEYCODE_TAB) {
            this.onSuggestionAccepted();

        } else if (event.keyCode === KEYCODE_UP) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === 0 ? (this.state.suggestions.length - 1) : (this.state.highlightedSuggestion - 1)
            });
        } else if (event.keyCode === KEYCODE_DOWN) {
            this.setState({
                highlightedSuggestion: this.state.highlightedSuggestion === (this.state.suggestions.length - 1) ? 0 : (this.state.highlightedSuggestion + 1)
            });
        } else return;

        event.preventDefault();
    }

    onInputBlur() {
        this.setState({
            suggestions: [],
            highlightedSuggestion: 0,
            suggestionsTitle: null
        });

        // whenever our input blurs we push the updated expression to our parent
        // TODO: only push if we are in a valid state!
        this.props.onChange(this.state.parsedExpression, this.state.expressionString);
    }

    onInputChange() {
        let inputElement = document.getElementById('react_qb_expression_input'),
            expression   = inputElement.value;

        var errorMessage          = null,
            tokens                = [],
            suggestions           = [],
            suggestionsTitle      = null,
            highlightedSuggestion = this.state.highlightedSuggestion,
            parsedExpression;

        try {
            //tokens = tokenizeExpressionString(expression);
            //console.log('tokens (before parse)', tokens);

            tokens = parseExpressionString(expression, this.props.tableMetadata.fields, VALID_OPERATORS);
            console.log('tokens (after parse):', tokens);

            let errorToken = getErrorToken(tokens);
            if (errorToken) errorMessage = errorToken.error;

            console.log('errorMessage: ', errorMessage);

            let cursorPosition = inputElement.selectionStart;
            let tokenAtPoint = tokenAtPosition(tokens, cursorPosition);
            console.log('tokenAtPoint:', tokenAtPoint);

            if (tokenAtPoint && tokenAtPoint.suggestions) {
                suggestions = tokenAtPoint.suggestions;
                suggestionsTitle = tokenAtPoint.suggestionsTitle;
            }

            if (highlightedSuggestion >= suggestions.length) highlightedSuggestion = suggestions.length - 1;
            if (highlightedSuggestion < 0)                   highlightedSuggestion = 0;

            parsedExpression = tokensToExpression(tokens);

        } catch (e) {
            errorMessage = e;
        }

        if (errorMessage) console.error('expression error message:', errorMessage);

        this.setState({
            expressionErrorMessage: errorMessage,
            expressionString: expression,
            parsedExpression: parsedExpression,
            suggestions: suggestions,
            suggestionsTitle: suggestionsTitle,
            highlightedSuggestion: highlightedSuggestion,
            tokens: tokens
        });
    }

    render() {
        let errorMessage = this.state.expressionErrorMessage;
        if (errorMessage && !errorMessage.length) errorMessage = 'unknown error';

        console.log('suggestions:', this.state.suggestions, 'highlightedSuggestion:', this.state.highlightedSuggestion, 'title:', this.state.suggestionsTitle);

        const { placeholder } = this.props;

        return (
            <div>
                <input
                    id="react_qb_expression_input"
                    className="my1 p1 input block full h4 text-dark"
                    type="text"
                    placeholder={placeholder}
                    value={this.state.expressionString}
                    onChange={this.onInputChange}
                    onKeyDown={this.onInputKeyDown}
                    onBlur={this.onInputBlur}
                    onFocus={this.onInputChange}
                    focus={true}
                />
                {this.state.suggestions.length ?
                 <Popover
                     className="p2 not-rounded border-dark"
                     hasArrow={false}
                     tetherOptions={{
                             attachment: 'top left',
                             targetAttachment: 'bottom left',
                             targetOffset: '0 ' + ((this.state.expressionString.length / 2) * 6)
                         }}
                 >
                     <div style={{minWidth: 150, maxHeight: 342, overflow: "hidden"}}>
                         <h5 style={{marginBottom: 2}} className="h6 text-grey-2">{this.state.suggestionsTitle}</h5>
                         <ul>
                             {this.state.suggestions.map((suggestion, i) =>
                                 <li style={{paddingTop: "2px", paddingBottom: "2px", cursor: "pointer"}}
                                     className={cx({"text-bold text-brand": i === this.state.highlightedSuggestion})}
                                     data-i={i}
                                     onMouseDown={this.onSuggestionMouseDown}
                                 >
                                     {suggestion.display_name}
                                 </li>
                              )}
                         </ul>
                     </div>
                 </Popover>
                 : null}
            </div>
        );
    }
}
