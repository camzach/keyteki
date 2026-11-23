import React from 'react';
import PropTypes from 'prop-types';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);

        this.state = { error: null };
    }

    componentDidCatch(error) {
        this.setState({ error });
    }

    render() {
        if (this.state.error) {
            return (
                <div className='alert alert-danger'>
                    <p>{this.props.message}</p>
                </div>
            );
        }

        return this.props.children;
    }
}

ErrorBoundary.displayName = 'ErrorBoundary';
ErrorBoundary.propTypes = {
    children: PropTypes.node,
    message: PropTypes.string
};

export default ErrorBoundary;
